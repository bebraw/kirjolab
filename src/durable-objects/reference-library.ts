import { DurableObject } from "cloudflare:workers";
import { cloudflareSQLiteStorage } from "../persistence/sqlite/cloudflare";
import { normalizeDoi, parseBibTeX } from "../domain/reference-library/bibliography";
import {
  buildCitationNetwork,
  type CitationAssertion,
  type CitationAssertionReview,
  type CitationNetwork,
  type CreateCitationAssertionInput,
  type ReviewCitationAssertionInput,
} from "../domain/citation/citation-assertions";
import type {
  CitationCandidateAcceptance,
  CitationCandidateBatchAcceptance,
  CitationCandidateSource,
} from "../domain/citation/citation-expansion-types";
import type { CitationResearchQueueItem, QueueCitationReferenceInput } from "../domain/citation/citation-research-queue";
import type {
  ArtifactAnalysis,
  ArtifactAnalysisKind,
  ArtifactAnalysisQueueReservation,
  ArtifactAnalysisResult,
  PdfReferenceAnalysisCandidate,
  PdfReferenceAnalysisResult,
} from "../domain/reference-library/artifact-analysis";
import {
  likelyReferenceIdentity,
  libraryPdfRectsOverlap,
  crossrefMetadataFields,
  isCrossrefMetadata,
  isMetadataRefinementPreview,
  memorableReferenceKey,
  mergeLibraryHighlightQuote,
  mergeLibraryPdfRects,
  missingRequiredBibliographicFields,
  referenceFromBibTeX,
  type BibliographicRecord,
  type CrossrefMetadata,
  type CrossrefMetadataField,
  type LibraryHighlight,
  type LibraryHighlightImportCandidate,
  type LibraryNote,
  type LibraryPdfArtifact,
  type LibraryPdfArtifactItem,
  type LibraryPdfArtifactPage,
  type LibraryPdfCatalogItem,
  type LegacyLibraryPdfArtifactPage,
  type LibraryPdfDrawing,
  type LibraryPdfMarkup,
  type LibraryPdfNote,
  type LibraryPdfPoint,
  type MetadataFieldProvenance,
  type MetadataRefinementPreview,
  type PdfDraftResult,
  type PdfReferenceCandidateReview,
  type PdfReferenceCandidateReviewResult,
  type PdfReferenceReviewQueue,
  type ReviewPdfReferenceCandidateBatchItem,
  type ReadingState,
  type ReviewedPdfMetadata,
  type ReviewedProviderMetadataSelection,
  type ReferenceLibrarySnapshot,
  type ReferenceMergeInput,
  type ReferenceMergeResult,
  type ReferenceReconciliationCandidate,
  type ReferenceReconciliationReport,
  type ReferenceKeyState,
  type ResearchShareKind,
  type ResearchShareSnapshot,
  type ScholarlyMetadataProvider,
  type WebCaptureRegistration,
  type WebSnapshot,
  type WebSource,
  suggestPdfReferenceMatch,
  libraryPdfCatalogItemByteLength,
  maximumLibraryPdfArtifactPageBytes,
  projectLibraryPdfCatalogItem,
  referenceReconciliationReason,
} from "../domain/reference-library";
import { ArtifactAnalysisService } from "./reference-library/artifact-analysis";
import { runSQLiteMigrations } from "../persistence/sqlite/migrations";
import { referenceLibraryMigrations } from "./reference-library/migrations";
import { currentRecoveryBookmark } from "./recovery";

const metadataPreviewCacheTtlMilliseconds = 5 * 60 * 1_000;
const maximumMetadataPreviewCacheEntries = 16;
const artifactAnalysisPublicationDelayMilliseconds = 30_000;
const artifactAnalysisPublicationRetryMilliseconds = 60_000;
const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;

interface MetadataPreviewCacheEntry {
  readonly preview: MetadataRefinementPreview;
  readonly expiresAt: number;
}

interface ReferenceRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_key: string | null;
  reference_key_state: string;
  identity_key: string;
  entry_type: string;
  title: string;
  authors_json: string;
  publication_year: string;
  venue: string;
  doi: string;
  url: string;
  abstract: string;
  provenance_json: string;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ArtifactRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_id: string | null;
  name: string;
  content_type: string;
  size: number;
  object_key: string;
  fingerprint: string;
  rights: string;
  created_at: string;
}

interface WebSourceRow extends Record<string, SqlStorageValue> {
  reference_id: string;
  canonical_url: string;
  created_at: string;
  updated_at: string;
}

interface WebSnapshotRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_id: string;
  requested_url: string;
  final_url: string;
  accessed_at: string;
  http_status: number;
  content_type: string;
  raw_object_key: string | null;
  readable_object_key: string | null;
  raw_size: number;
  readable_size: number;
  content_hash: string;
  title: string;
  authors_json: string;
  publisher: string;
  published_at: string;
  complete: number;
  diagnostics_json: string;
  redirect_chain_json: string;
  etag: string;
  last_modified: string;
}

interface NoteRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface HighlightRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_id: string;
  artifact_id: string;
  page: number;
  quote: string;
  comment: string;
  rects_json: string;
  created_at: string;
  updated_at: string;
}

interface PdfMarkupRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_id: string;
  artifact_id: string;
  page: number;
  kind: string;
  x: number | null;
  y: number | null;
  body: string;
  color: string;
  width: number | null;
  points_json: string;
  created_at: string;
  updated_at: string;
}

interface PdfDrawingMutationInput {
  readonly referenceId: string;
  readonly artifactId: string;
  readonly page: number;
  readonly color: string;
  readonly width: number;
  readonly points: readonly LibraryPdfPoint[];
}

interface ReadingRow extends Record<string, SqlStorageValue> {
  reference_id: string;
  status: string;
  rating: number | null;
  priority: string;
  updated_at: string;
}

interface TagRow extends Record<string, SqlStorageValue> {
  reference_id: string;
  tag: string;
}

interface CollectionRow extends Record<string, SqlStorageValue> {
  reference_id: string;
  collection_name: string;
}

interface ProjectDependencyRow extends Record<string, SqlStorageValue> {
  project_id: string;
  reference_id: string;
}

interface ShareRow extends Record<string, SqlStorageValue> {
  id: string;
  project_id: string;
  reference_id: string;
  resource_id: string;
  kind: string;
  snapshot_json: string;
  created_at: string;
  revoked_at: string | null;
}

interface CitationAssertionRow extends Record<string, SqlStorageValue> {
  id: string;
  citing_reference_id: string;
  cited_reference_id: string;
  polarity: string;
  evidence_state: string;
  extraction_method: string;
  asserted_by: string;
  observed_at: string;
  source_kind: string;
  source_id: string;
  source_locator: string;
  confidence: number | null;
  review_decision: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

interface CitationResearchQueueRow extends Record<string, SqlStorageValue> {
  reference_id: string;
  seed_reference_id: string;
  direction: string;
  added_at: string;
}

interface PdfReferenceReviewRow extends Record<string, SqlStorageValue> {
  artifact_id: string;
  fingerprint: string;
  candidate_id: string;
  decision: string;
  reference_id: string | null;
  assertion_id: string | null;
  reviewed_by: string;
  reviewed_at: string;
}

interface PdfReferenceReviewRequest {
  readonly actor: string;
  readonly artifactId: string;
  readonly candidateId: string;
  readonly decision: "accepted" | "rejected";
  readonly fingerprint: string;
  readonly referenceId: string | undefined;
}

interface PdfReferenceReviewContext {
  readonly analysis: ArtifactAnalysis;
  readonly artifact: LibraryPdfArtifact;
  readonly candidate: PdfReferenceAnalysisCandidate;
  readonly citingReferenceId: string;
  readonly existing: PdfReferenceReviewRow | undefined;
  readonly referenceAnalysis: PdfReferenceAnalysisResult;
}

export interface ReferenceImportItem {
  readonly reference: BibliographicRecord;
  readonly suggestedAlias: string;
  readonly created: boolean;
}

export interface ReferenceDeletionImpact {
  readonly referenceId: string;
  readonly projectIds: readonly string[];
  readonly artifactCount: number;
  readonly noteCount: number;
  readonly highlightCount: number;
  readonly pdfMarkupCount: number;
  readonly webSnapshotCount: number;
}

export interface WebCaptureItem {
  readonly reference: BibliographicRecord;
  readonly source: WebSource;
  readonly snapshot: WebSnapshot;
  readonly created: boolean;
}

export class ReferenceLibrary extends DurableObject<Env> {
  readonly #artifactAnalyses: ArtifactAnalysisService;
  readonly #metadataPreviewCache = new Map<string, MetadataPreviewCacheEntry>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#artifactAnalyses = new ArtifactAnalysisService(ctx.storage.sql);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("PRAGMA foreign_keys = ON");
      runSQLiteMigrations(cloudflareSQLiteStorage(this.ctx.storage), referenceLibraryMigrations);
      this.#backfillReferenceKeys();
      await this.#recoverArtifactAnalysisPublications();
    });
  }

  getSnapshot(includeArchived = false): ReferenceLibrarySnapshot {
    const where = includeArchived ? "deleted_at IS NULL" : "archived_at IS NULL AND deleted_at IS NULL";
    const referenceRows = this.ctx.storage.sql
      .exec<ReferenceRow>(`SELECT * FROM library_references WHERE ${where} ORDER BY title COLLATE NOCASE, id`)
      .toArray();
    const references = referenceRows.map(referenceFromRow);
    const referenceIds = new Set(references.map((reference) => reference.id));
    const artifacts = this.ctx.storage.sql
      .exec<ArtifactRow>("SELECT * FROM artifacts ORDER BY created_at DESC, id")
      .toArray()
      .map(artifactFromRow)
      .filter((artifact) => artifact.referenceId === null || referenceIds.has(artifact.referenceId));
    const webSources = this.ctx.storage.sql
      .exec<WebSourceRow>("SELECT * FROM web_sources ORDER BY updated_at DESC, reference_id")
      .toArray()
      .filter((source) => referenceIds.has(source.reference_id))
      .map(webSourceFromRow);
    return {
      references,
      referenceKeyStates: Object.fromEntries(referenceRows.map((row) => [row.id, referenceKeyStateFromRow(row)])),
      artifacts,
      webSources,
      webSnapshots: this.ctx.storage.sql
        .exec<WebSnapshotRow>("SELECT * FROM web_snapshots ORDER BY accessed_at DESC, id LIMIT 512")
        .toArray()
        .filter((snapshot) => referenceIds.has(snapshot.reference_id))
        .map(webSnapshotFromRow),
      notes: this.ctx.storage.sql
        .exec<NoteRow>("SELECT * FROM notes ORDER BY updated_at DESC, id")
        .toArray()
        .filter((row) => referenceIds.has(row.reference_id))
        .map(noteFromRow),
      highlights: this.ctx.storage.sql
        .exec<HighlightRow>("SELECT * FROM highlights ORDER BY updated_at DESC, id")
        .toArray()
        .filter((row) => referenceIds.has(row.reference_id))
        .map(highlightFromRow),
      pdfMarkups: this.ctx.storage.sql
        .exec<PdfMarkupRow>("SELECT * FROM pdf_markups ORDER BY updated_at DESC, id LIMIT 10000")
        .toArray()
        .filter((row) => referenceIds.has(row.reference_id))
        .map(pdfMarkupFromRow),
      tags: this.#tags(referenceIds),
      collections: this.#collections(referenceIds),
      reading: this.ctx.storage.sql
        .exec<ReadingRow>("SELECT * FROM reading_state ORDER BY updated_at DESC")
        .toArray()
        .filter((row) => referenceIds.has(row.reference_id))
        .map(readingFromRow),
    };
  }

  getPdfArtifactPage(after: string | null, limit: number): LegacyLibraryPdfArtifactPage | null {
    const rows = this.#pdfArtifactPageRows(after, limit);
    if (!rows) return null;
    const items = rows.slice(0, limit).map((row) => {
      const artifact = artifactFromRow(row);
      return { artifact, reference: artifact.referenceId ? this.#reference(artifact.referenceId) : null };
    });
    return { items, next: rows.length > limit ? (items.at(-1)?.artifact.id ?? null) : null };
  }

  getCorpusPdfArtifactPage(after: string | null, limit: number): LibraryPdfArtifactPage | null {
    const rows = this.#pdfArtifactPageRows(after, limit);
    if (!rows) return null;
    const page = this.#pdfArtifactItems(rows.slice(0, limit));
    return {
      items: page.items,
      next: rows.length > limit || page.truncated ? (page.items.at(-1)?.artifact.id ?? null) : null,
    };
  }

  getPdfArtifact(artifactId: string): LibraryPdfArtifactItem | null {
    const row = this.ctx.storage.sql
      .exec<ArtifactRow>(
        `SELECT a.* FROM artifacts a
         LEFT JOIN library_references r ON r.id = a.reference_id
         WHERE a.id = ? AND (a.reference_id IS NULL OR (r.id IS NOT NULL AND r.deleted_at IS NULL)) LIMIT 1`,
        artifactId,
      )
      .toArray()[0];
    if (!row) return null;
    const artifact = artifactFromRow(row);
    return { artifact, reference: artifact.referenceId ? this.#reference(artifact.referenceId) : null };
  }

  async getBackupSnapshot(): Promise<{ snapshot: ReferenceLibrarySnapshot; bookmark: string | null }> {
    const snapshot = this.getSnapshot(true);
    return { snapshot, bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE) };
  }

  importBibTeX(source: string, actor: string): ReferenceImportItem[] {
    const entries = parseBibTeX(source);
    if (entries.length === 0) throw new Error("No valid BibTeX entries found");
    const capturedAt = new Date().toISOString();
    return this.ctx.storage.transactionSync(() =>
      entries.map((entry) => {
        const provenance: MetadataFieldProvenance = { method: "bibtex", capturedAt, actor };
        const candidate = referenceFromBibTeX(entry, crypto.randomUUID(), provenance);
        const identityKey = likelyReferenceIdentity(candidate);
        const existing = this.ctx.storage.sql
          .exec<ReferenceRow>("SELECT * FROM library_references WHERE identity_key = ?", identityKey)
          .toArray()[0];
        if (existing) {
          const referenceKeyState = referenceKeyStateFromRow(existing);
          const updated = {
            ...candidate,
            id: existing.id,
            referenceKey:
              referenceKeyState === "provisional"
                ? this.#allocateReferenceKey({ ...candidate, id: existing.id })
                : (existing.reference_key ?? this.#allocateReferenceKey(candidate)),
            createdAt: existing.created_at,
          };
          this.#writeReference(updated, identityKey, false, referenceKeyState);
          return { reference: updated, suggestedAlias: entry.citationKey, created: false };
        }
        const created = { ...candidate, referenceKey: this.#allocateReferenceKey(candidate) };
        this.#writeReference(created, identityKey, true);
        return { reference: created, suggestedAlias: entry.citationKey, created: true };
      }),
    );
  }

  getReferences(referenceIds: readonly string[]): BibliographicRecord[] {
    if (referenceIds.length > 512) throw new Error("Too many references requested");
    return referenceIds.map((id) => this.#reference(id, true));
  }

  getReferenceReconciliationReport(): ReferenceReconciliationReport {
    const rows = this.ctx.storage.sql
      .exec<ReferenceRow>(
        "SELECT * FROM library_references WHERE archived_at IS NULL AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 513",
      )
      .toArray();
    const truncatedReferences = rows.length > 512;
    const references = rows.slice(0, 512).map(referenceFromRow);
    const blockers = new Map<string, readonly string[]>();
    const candidates: ReferenceReconciliationCandidate[] = [];
    for (let leftIndex = 0; leftIndex < references.length; leftIndex += 1) {
      const left = references[leftIndex]!;
      for (const right of references.slice(leftIndex + 1)) {
        const reason = referenceReconciliationReason(left, right);
        if (!reason) continue;
        const leftBlockers = blockers.get(left.id) ?? this.#referenceMergeBlockers(left.id);
        const rightBlockers = blockers.get(right.id) ?? this.#referenceMergeBlockers(right.id);
        blockers.set(left.id, leftBlockers);
        blockers.set(right.id, rightBlockers);
        candidates.push({ left, right, reason, leftBlockers, rightBlockers });
        if (candidates.length >= 100) return { candidates, truncated: true };
      }
    }
    return { candidates, truncated: truncatedReferences };
  }

  mergeReferences(input: ReferenceMergeInput, actor: string): ReferenceMergeResult {
    const canonical = this.#reference(input.canonicalReferenceId);
    const canonicalRow = this.ctx.storage.sql.exec<ReferenceRow>("SELECT * FROM library_references WHERE id = ?", canonical.id).one();
    const duplicate = this.#reference(input.duplicateReferenceId);
    if (canonical.archivedAt || duplicate.archivedAt || !referenceReconciliationReason(canonical, duplicate)) {
      throw new Error("References are no longer a reconciliation candidate");
    }
    if (canonical.updatedAt !== input.expectedCanonicalUpdatedAt || duplicate.updatedAt !== input.expectedDuplicateUpdatedAt) {
      throw new Error("References changed; review reconciliation again");
    }
    const blockers = this.#referenceMergeBlockers(duplicate.id);
    if (blockers.length > 0) throw new Error(`Duplicate cannot be merged: ${blockers.join("; ")}`);
    const assertionRows = this.ctx.storage.sql
      .exec<CitationAssertionRow>(
        "SELECT * FROM citation_assertions WHERE citing_reference_id = ? OR cited_reference_id = ? ORDER BY created_at, id",
        duplicate.id,
        duplicate.id,
      )
      .toArray();
    if (
      assertionRows.some(
        (row) =>
          (row.citing_reference_id === duplicate.id ? canonical.id : row.citing_reference_id) ===
          (row.cited_reference_id === duplicate.id ? canonical.id : row.cited_reference_id),
      )
    ) {
      throw new Error("Duplicate cannot be merged while it has a citation relationship with the canonical reference");
    }
    const now = new Date().toISOString();
    const merged = mergeBibliographicRecords(canonical, duplicate, now, actor);
    const identityKey = likelyReferenceIdentity(merged);
    const identityOwner = this.ctx.storage.sql
      .exec<{
        id: string;
      }>("SELECT id FROM library_references WHERE identity_key = ? AND id NOT IN (?, ?) LIMIT 1", identityKey, canonical.id, duplicate.id)
      .toArray()[0];
    if (identityOwner) throw new Error("Merged reference identity already belongs to another Library record");
    const moved = {
      artifacts: this.#count("artifacts", duplicate.id),
      notes: this.#count("notes", duplicate.id),
      highlights: this.#count("highlights", duplicate.id),
      pdfMarkups: this.#count("pdf_markups", duplicate.id),
      citationAssertions: assertionRows.length,
    };
    this.ctx.storage.transactionSync(() => {
      for (const row of assertionRows) this.#reparentCitationAssertion(row, canonical.id, duplicate.id);
      this.ctx.storage.sql.exec("UPDATE pdf_reference_reviews SET reference_id = ? WHERE reference_id = ?", canonical.id, duplicate.id);
      for (const table of ["artifacts", "notes", "highlights", "pdf_markups"] as const) {
        this.ctx.storage.sql.exec(`UPDATE ${table} SET reference_id = ? WHERE reference_id = ?`, canonical.id, duplicate.id);
      }
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO reference_tags (reference_id, tag) SELECT ?, tag FROM reference_tags WHERE reference_id = ?",
        canonical.id,
        duplicate.id,
      );
      this.ctx.storage.sql.exec("DELETE FROM reference_tags WHERE reference_id = ?", duplicate.id);
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO reference_collections (reference_id, collection_name) SELECT ?, collection_name FROM reference_collections WHERE reference_id = ?",
        canonical.id,
        duplicate.id,
      );
      this.ctx.storage.sql.exec("DELETE FROM reference_collections WHERE reference_id = ?", duplicate.id);
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO reading_state (reference_id, status, rating, priority, updated_at)
         SELECT ?, status, rating, priority, updated_at FROM reading_state WHERE reference_id = ?`,
        canonical.id,
        duplicate.id,
      );
      this.ctx.storage.sql.exec("DELETE FROM reading_state WHERE reference_id = ?", duplicate.id);
      this.ctx.storage.sql.exec(
        "DELETE FROM citation_research_queue WHERE reference_id = ? AND seed_reference_id = ?",
        canonical.id,
        duplicate.id,
      );
      this.ctx.storage.sql.exec(
        "UPDATE citation_research_queue SET seed_reference_id = ? WHERE seed_reference_id = ? AND reference_id <> ?",
        canonical.id,
        duplicate.id,
        canonical.id,
      );
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO citation_research_queue (reference_id, seed_reference_id, direction, added_at)
         SELECT ?, seed_reference_id, direction, added_at FROM citation_research_queue
         WHERE reference_id = ? AND seed_reference_id <> ?`,
        canonical.id,
        duplicate.id,
        canonical.id,
      );
      this.ctx.storage.sql.exec("DELETE FROM citation_research_queue WHERE reference_id = ?", duplicate.id);
      this.ctx.storage.sql.exec("UPDATE library_references SET identity_key = ? WHERE id = ?", `merged:${duplicate.id}`, duplicate.id);
      this.#writeReference(merged, identityKey, false, referenceKeyStateFromRow(canonicalRow));
      this.ctx.storage.sql.exec(
        `UPDATE library_references SET authors_json = '[]', venue = '', doi = '', url = '', abstract = '', provenance_json = '{}',
         archived_at = NULL, deleted_at = ?, updated_at = ? WHERE id = ?`,
        now,
        now,
        duplicate.id,
      );
    });
    this.#invalidateMetadataRefinementPreviews(canonical.id);
    this.#invalidateMetadataRefinementPreviews(duplicate.id);
    return { canonicalReference: merged, mergedReferenceId: duplicate.id, moved };
  }

  findReferencesByDois(doiValues: readonly string[]): BibliographicRecord[] {
    if (doiValues.length > 128) throw new Error("Too many citation identifiers requested");
    const found = new Map<string, BibliographicRecord>();
    for (const doi of doiValues.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean)) {
      const row = this.ctx.storage.sql
        .exec<ReferenceRow>("SELECT * FROM library_references WHERE LOWER(doi) = ? AND deleted_at IS NULL LIMIT 1", doi)
        .toArray()[0];
      if (row) found.set(row.id, referenceFromRow(row));
    }
    return [...found.values()];
  }

  createCitationAssertions(inputs: readonly CreateCitationAssertionInput[], actor: string): CitationAssertion[] {
    if (inputs.length === 0 || inputs.length > 128) throw new Error("Add between 1 and 128 citation assertions at a time");
    return this.ctx.storage.transactionSync(() => inputs.map((input) => this.#createCitationAssertion(input, actor)));
  }

  getCitationResearchQueue(): CitationResearchQueueItem[] {
    return this.ctx.storage.sql
      .exec<CitationResearchQueueRow>(
        "SELECT reference_id, seed_reference_id, direction, added_at FROM citation_research_queue ORDER BY added_at, reference_id LIMIT 129",
      )
      .toArray()
      .slice(0, 128)
      .map(citationResearchQueueItemFromRow);
  }

  queueCitationReference(referenceId: string, input: QueueCitationReferenceInput): CitationResearchQueueItem {
    this.#reference(referenceId);
    this.#reference(input.seedReferenceId);
    if (referenceId === input.seedReferenceId || (input.direction !== "references" && input.direction !== "citations")) {
      throw new Error("Citation research queue item is invalid");
    }
    const alreadyQueued = this.ctx.storage.sql
      .exec<{ found: number }>("SELECT 1 AS found FROM citation_research_queue WHERE reference_id = ?", referenceId)
      .toArray()[0];
    const count =
      this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM citation_research_queue").toArray()[0]?.count ?? 0;
    if (!alreadyQueued && count >= 128) throw new Error("Citation research queue is full");
    const item: CitationResearchQueueItem = { ...input, referenceId, addedAt: new Date().toISOString() };
    this.ctx.storage.sql.exec(
      `INSERT INTO citation_research_queue (reference_id, seed_reference_id, direction, added_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(reference_id) DO UPDATE SET
         seed_reference_id = excluded.seed_reference_id,
         direction = excluded.direction,
         added_at = excluded.added_at`,
      item.referenceId,
      item.seedReferenceId,
      item.direction,
      item.addedAt,
    );
    return item;
  }

  removeCitationResearchQueueItem(referenceId: string): CitationResearchQueueItem {
    const existing = this.ctx.storage.sql
      .exec<CitationResearchQueueRow>(
        "SELECT reference_id, seed_reference_id, direction, added_at FROM citation_research_queue WHERE reference_id = ?",
        referenceId,
      )
      .toArray()[0];
    if (!existing) throw new Error("Citation research queue item not found");
    this.ctx.storage.sql.exec("DELETE FROM citation_research_queue WHERE reference_id = ?", referenceId);
    return citationResearchQueueItemFromRow(existing);
  }

  acceptCitationCandidate(
    seedReferenceId: string,
    metadata: CrossrefMetadata,
    source: CitationCandidateSource,
    actor: string,
  ): CitationCandidateAcceptance {
    this.#validateCitationCandidateBatch(seedReferenceId, [metadata], source);
    return this.ctx.storage.transactionSync(() => this.#acceptCitationCandidate(seedReferenceId, metadata, source, actor));
  }

  acceptCitationCandidates(
    seedReferenceId: string,
    metadata: readonly CrossrefMetadata[],
    source: CitationCandidateSource,
    actor: string,
  ): CitationCandidateBatchAcceptance {
    this.#validateCitationCandidateBatch(seedReferenceId, metadata, source);
    return {
      accepted: this.ctx.storage.transactionSync(() =>
        metadata.map((candidate) => this.#acceptCitationCandidate(seedReferenceId, candidate, source, actor)),
      ),
    };
  }

  getPdfReferenceReviewQueue(artifactId: string): PdfReferenceReviewQueue | null {
    const artifact = this.#artifact(artifactId);
    if (!artifact.referenceId) throw new Error("Identify the PDF before reviewing its references");
    const citingReferenceId = artifact.referenceId;
    const analysis = this.#artifactAnalyses.get(artifactId, "pdf-references");
    if (analysis?.status !== "ready" || !analysis.result || !("referencesStartPage" in analysis.result)) {
      return null;
    }
    const references = this.ctx.storage.sql
      .exec<ReferenceRow>("SELECT * FROM library_references WHERE deleted_at IS NULL ORDER BY title COLLATE NOCASE, id")
      .toArray()
      .map(referenceFromRow)
      .filter((reference) => reference.id !== citingReferenceId);
    const reviews = new Map(
      this.ctx.storage.sql
        .exec<PdfReferenceReviewRow>(
          "SELECT * FROM pdf_reference_reviews WHERE artifact_id = ? AND fingerprint = ?",
          artifactId,
          analysis.fingerprint,
        )
        .toArray()
        .map((row) => [row.candidate_id, pdfReferenceReviewFromRow(row)]),
    );
    return {
      artifactId,
      fingerprint: analysis.fingerprint,
      citingReferenceId,
      candidates: analysis.result.candidates.map((candidate) => {
        const suggestion = suggestPdfReferenceMatch(candidate, references);
        return {
          ...candidate,
          match: suggestion?.reference ?? null,
          matchKind: suggestion?.kind ?? null,
          review: reviews.get(candidate.id) ?? null,
        };
      }),
    };
  }

  reviewPdfReferenceCandidate(
    artifactId: string,
    fingerprint: string,
    candidateId: string,
    decision: "accepted" | "rejected",
    referenceId: string | undefined,
    actor: string,
  ): PdfReferenceCandidateReviewResult {
    return this.ctx.storage.transactionSync(() =>
      this.#reviewPdfReferenceCandidate({ actor, artifactId, candidateId, decision, fingerprint, referenceId }, true),
    );
  }

  reviewPdfReferenceCandidates(
    artifactId: string,
    fingerprint: string,
    candidates: readonly ReviewPdfReferenceCandidateBatchItem[],
    actor: string,
  ): PdfReferenceCandidateReviewResult[] {
    if (candidates.length === 0 || candidates.length > 128) throw new Error("Invalid PDF reference review batch");
    if (new Set(candidates.map(({ candidateId }) => candidateId)).size !== candidates.length) {
      throw new Error("PDF reference review batch contains duplicate candidates");
    }
    return this.ctx.storage.transactionSync(() =>
      candidates.map(({ candidateId, referenceId }) =>
        this.#reviewPdfReferenceCandidate({ actor, artifactId, candidateId, decision: "accepted", fingerprint, referenceId }, false),
      ),
    );
  }

  #reviewPdfReferenceCandidate(request: PdfReferenceReviewRequest, acceptPreviouslyRejected: boolean): PdfReferenceCandidateReviewResult {
    const { actor, artifactId, candidateId, decision, fingerprint, referenceId } = request;
    const context = this.#pdfReferenceReviewContext(request);
    const { analysis, artifact, candidate, citingReferenceId, existing, referenceAnalysis } = context;
    if (existing?.decision === "accepted") return this.#acceptedPdfReferenceReview(existing);
    if (existing?.decision === "rejected" && decision === "accepted" && !acceptPreviouslyRejected) {
      throw new Error("PDF reference candidate was already skipped");
    }
    if (decision === "rejected") {
      const review = this.#writePdfReferenceReview(artifactId, fingerprint, candidateId, decision, null, null, actor);
      return { review, reference: null, assertion: null };
    }
    const reference = this.#resolvePdfReferenceCandidate(context, referenceId, actor);
    const assertion = this.#createCitationAssertion(
      {
        citingReferenceId,
        citedReferenceId: reference.id,
        polarity: "cites",
        evidenceState: "extracted",
        method: "source-extraction",
        observedAt: analysis.completedAt ?? analysis.requestedAt,
        sourceKind: "pdf-artifact",
        sourceId: artifact.id,
        sourceLocator: pdfReferenceSourceLocator(referenceAnalysis, candidate.id, candidate.page),
        confidence: candidate.confidence,
      },
      "PDF reference analysis",
    );
    const review = this.#writePdfReferenceReview(artifactId, fingerprint, candidateId, decision, reference.id, assertion.id, actor);
    return { review, reference, assertion };
  }

  #pdfReferenceReviewContext(request: PdfReferenceReviewRequest): PdfReferenceReviewContext {
    const { artifactId, candidateId, fingerprint } = request;
    const artifact = this.#artifact(artifactId);
    if (!artifact.referenceId) throw new Error("Identify the PDF before reviewing its references");
    const citingReferenceId = artifact.referenceId;
    const analysis = this.#artifactAnalyses.get(artifactId, "pdf-references");
    if (
      analysis?.status !== "ready" ||
      analysis.fingerprint !== fingerprint ||
      !analysis.result ||
      !("referencesStartPage" in analysis.result)
    ) {
      throw new Error("PDF reference analysis changed; review the current results again");
    }
    const referenceAnalysis = analysis.result;
    const candidate = referenceAnalysis.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error("PDF reference candidate not found");
    const existing = this.ctx.storage.sql
      .exec<PdfReferenceReviewRow>(
        "SELECT * FROM pdf_reference_reviews WHERE artifact_id = ? AND candidate_id = ? AND fingerprint = ?",
        artifactId,
        candidateId,
        fingerprint,
      )
      .toArray()[0];
    return { analysis, artifact, candidate, citingReferenceId, existing, referenceAnalysis };
  }

  #acceptedPdfReferenceReview(existing: PdfReferenceReviewRow): PdfReferenceCandidateReviewResult {
    const review = pdfReferenceReviewFromRow(existing);
    return {
      review,
      reference: this.#reference(review.referenceId!),
      assertion: citationAssertionFromRow(this.#citationAssertion(review.assertionId!)),
    };
  }

  #resolvePdfReferenceCandidate(context: PdfReferenceReviewContext, referenceId: string | undefined, actor: string): BibliographicRecord {
    const { analysis, artifact, candidate, citingReferenceId } = context;
    const exactDoi = normalizeDoi(candidate.doi);
    const doiRow = this.#pdfReferenceDoiRow(exactDoi);
    const selectedReference = this.#selectedPdfReference(candidate, doiRow, referenceId);
    const reference = doiRow
      ? referenceFromRow(doiRow)
      : selectedReference
        ? selectedReference
        : this.#createPdfReferenceCandidate(artifact.id, candidate, analysis.completedAt ?? new Date().toISOString(), actor);
    this.#validateResolvedPdfReference(reference, citingReferenceId, exactDoi);
    return reference;
  }

  #pdfReferenceDoiRow(doi: string): ReferenceRow | undefined {
    if (!doi) return undefined;
    return this.ctx.storage.sql
      .exec<ReferenceRow>("SELECT * FROM library_references WHERE LOWER(doi) = ? AND deleted_at IS NULL LIMIT 1", doi)
      .toArray()[0];
  }

  #selectedPdfReference(
    candidate: PdfReferenceAnalysisCandidate,
    doiRow: ReferenceRow | undefined,
    referenceId: string | undefined,
  ): BibliographicRecord | null {
    if (doiRow && referenceId && doiRow.id !== referenceId) throw new Error("The candidate DOI matches a different library reference");
    if (doiRow || !referenceId) return null;
    const reference = this.#reference(referenceId);
    const suggestion = suggestPdfReferenceMatch(candidate, [reference]);
    if (suggestion?.kind !== "bibliographic" || suggestion.reference.id !== reference.id) {
      throw new Error("The selected library reference does not match the analyzed bibliography entry");
    }
    return reference;
  }

  #validateResolvedPdfReference(reference: BibliographicRecord, citingReferenceId: string, exactDoi: string): void {
    if (reference.id === citingReferenceId) throw new Error("A PDF reference cannot cite itself");
    if (exactDoi && reference.doi && normalizeDoi(reference.doi) !== exactDoi) {
      throw new Error("The selected library reference has a different DOI");
    }
  }

  getCitationAssertions(referenceId?: string): CitationAssertion[] {
    if (referenceId) this.#reference(referenceId, true);
    const rows = referenceId
      ? this.ctx.storage.sql
          .exec<CitationAssertionRow>(
            `SELECT * FROM citation_assertions
             WHERE citing_reference_id = ? OR cited_reference_id = ? ORDER BY created_at, id LIMIT 512`,
            referenceId,
            referenceId,
          )
          .toArray()
      : this.ctx.storage.sql.exec<CitationAssertionRow>("SELECT * FROM citation_assertions ORDER BY created_at, id LIMIT 512").toArray();
    return rows.map(citationAssertionFromRow);
  }

  reviewCitationAssertion(assertionId: string, input: ReviewCitationAssertionInput, reviewer: string): CitationAssertion {
    const row = this.#citationAssertion(assertionId);
    const reviewedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE citation_assertions SET review_decision = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`,
      input.decision,
      reviewer,
      reviewedAt,
      input.note.trim(),
      assertionId,
    );
    return {
      ...citationAssertionFromRow(row),
      review: { decision: input.decision, reviewer, reviewedAt, note: input.note.trim() },
    };
  }

  getCitationNetwork(projectId?: string): CitationNetwork {
    const references = this.ctx.storage.sql
      .exec<ReferenceRow>(
        "SELECT * FROM library_references WHERE archived_at IS NULL AND deleted_at IS NULL ORDER BY title COLLATE NOCASE, id",
      )
      .toArray()
      .map(referenceFromRow);
    const assertions = this.ctx.storage.sql
      .exec<CitationAssertionRow>("SELECT * FROM citation_assertions ORDER BY created_at, id LIMIT 513")
      .toArray()
      .map(citationAssertionFromRow);
    const projectReferenceIds = projectId
      ? new Set(
          this.ctx.storage.sql
            .exec<ProjectDependencyRow>("SELECT project_id, reference_id FROM project_dependencies WHERE project_id = ?", projectId)
            .toArray()
            .map((row) => row.reference_id),
        )
      : new Set<string>();
    return buildCitationNetwork(references, assertions, projectId ?? null, projectReferenceIds);
  }

  registerWebCapture(registration: WebCaptureRegistration): WebCaptureItem {
    const existingSource = this.ctx.storage.sql
      .exec<WebSourceRow>("SELECT * FROM web_sources WHERE canonical_url = ?", registration.canonicalUrl)
      .toArray()[0];
    const count = existingSource
      ? this.ctx.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM web_snapshots WHERE reference_id = ?", existingSource.reference_id)
          .one().count
      : 0;
    if (count >= 512) throw new Error("A web source may retain at most 512 captures");
    const now = registration.snapshot.accessedAt;
    const referenceId = existingSource?.reference_id ?? crypto.randomUUID();
    const existingReferenceRow = existingSource
      ? this.ctx.storage.sql.exec<ReferenceRow>("SELECT * FROM library_references WHERE id = ?", referenceId).one()
      : null;
    const existingReference = existingReferenceRow ? referenceFromRow(existingReferenceRow) : null;
    const referenceKeyState = existingReferenceRow ? referenceKeyStateFromRow(existingReferenceRow) : "provisional";
    const snapshot: WebSnapshot = { ...registration.snapshot, referenceId };
    const provenance: MetadataFieldProvenance = { method: "web", capturedAt: now, actor: registration.actor };
    const reference: BibliographicRecord = {
      id: referenceId,
      referenceKey: existingReference?.referenceKey ?? "",
      type: "misc",
      title: snapshot.title || existingReference?.title || registration.canonicalUrl,
      authors: snapshot.authors.length > 0 ? [...snapshot.authors] : (existingReference?.authors ?? []),
      year: publicationYear(snapshot.publishedAt) || existingReference?.year || "",
      venue: snapshot.publisher || existingReference?.venue || "",
      doi: existingReference?.doi ?? "",
      url: registration.canonicalUrl,
      abstract: existingReference?.abstract ?? "",
      provenance: {
        ...existingReference?.provenance,
        type: provenance,
        title: provenance,
        authors: provenance,
        year: provenance,
        venue: provenance,
        url: provenance,
      },
      archivedAt: null,
      deletedAt: null,
      createdAt: existingReference?.createdAt ?? now,
      updatedAt: now,
    };
    const keyedReference =
      referenceKeyState === "provisional" || !reference.referenceKey
        ? { ...reference, referenceKey: this.#allocateReferenceKey(reference) }
        : reference;
    const source: WebSource = {
      referenceId,
      canonicalUrl: registration.canonicalUrl,
      createdAt: existingSource?.created_at ?? now,
      updatedAt: now,
    };
    this.ctx.storage.transactionSync(() => {
      this.#writeReference(keyedReference, `web:${registration.canonicalUrl}`, !existingSource, referenceKeyState);
      this.ctx.storage.sql.exec(
        `INSERT INTO web_sources (reference_id, canonical_url, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(reference_id) DO UPDATE SET canonical_url = excluded.canonical_url, updated_at = excluded.updated_at`,
        referenceId,
        registration.canonicalUrl,
        source.createdAt,
        now,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO web_snapshots
         (id, reference_id, requested_url, final_url, accessed_at, http_status, content_type, raw_object_key,
          readable_object_key, raw_size, readable_size, content_hash, title, authors_json, publisher, published_at,
          complete, diagnostics_json, redirect_chain_json, etag, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        snapshot.id,
        snapshot.referenceId,
        snapshot.requestedUrl,
        snapshot.finalUrl,
        snapshot.accessedAt,
        snapshot.status,
        snapshot.contentType,
        snapshot.rawObjectKey,
        snapshot.readableObjectKey,
        snapshot.rawSize,
        snapshot.readableSize,
        snapshot.contentHash,
        snapshot.title,
        JSON.stringify(snapshot.authors),
        snapshot.publisher,
        snapshot.publishedAt,
        snapshot.complete ? 1 : 0,
        JSON.stringify(snapshot.diagnostics),
        JSON.stringify(snapshot.redirectChain),
        snapshot.etag,
        snapshot.lastModified,
      );
    });
    return { reference: keyedReference, source, snapshot, created: !existingSource };
  }

  getWebSnapshot(snapshotId: string): WebSnapshot {
    const row = this.ctx.storage.sql.exec<WebSnapshotRow>("SELECT * FROM web_snapshots WHERE id = ?", snapshotId).toArray()[0];
    if (!row) throw new Error("Web snapshot not found");
    return webSnapshotFromRow(row);
  }

  getWebSnapshots(referenceId: string): WebSnapshot[] {
    this.#reference(referenceId);
    return this.ctx.storage.sql
      .exec<WebSnapshotRow>("SELECT * FROM web_snapshots WHERE reference_id = ? ORDER BY accessed_at DESC, id LIMIT 512", referenceId)
      .toArray()
      .map(webSnapshotFromRow);
  }

  getLatestWebSnapshot(referenceId: string): WebSnapshot | null {
    const row = this.ctx.storage.sql
      .exec<WebSnapshotRow>("SELECT * FROM web_snapshots WHERE reference_id = ? ORDER BY accessed_at DESC, id DESC LIMIT 1", referenceId)
      .toArray()[0];
    return row ? webSnapshotFromRow(row) : null;
  }

  registerPdf(artifact: LibraryPdfArtifact): LibraryPdfArtifact {
    if (artifact.referenceId !== null) throw new Error("A PDF must be registered before it is identified");
    this.ctx.storage.sql.exec(
      `INSERT INTO artifacts (id, reference_id, name, content_type, size, object_key, fingerprint, rights, created_at)
       VALUES (?, NULL, ?, 'application/pdf', ?, ?, ?, ?, ?)`,
      artifact.id,
      artifact.name,
      artifact.size,
      artifact.objectKey,
      artifact.fingerprint,
      artifact.rights,
      artifact.createdAt,
    );
    return artifact;
  }

  createPdfDraft(artifact: LibraryPdfArtifact, actor: string): PdfDraftResult {
    if (artifact.referenceId !== null) throw new Error("A new PDF draft must not already identify a reference");
    const identityKey = `pdf:${artifact.fingerprint}`;
    const existingRow = this.ctx.storage.sql
      .exec<ReferenceRow>("SELECT * FROM library_references WHERE identity_key = ? LIMIT 1", identityKey)
      .toArray()[0];
    if (existingRow) {
      const reference = referenceFromRow(existingRow);
      if (reference.deletedAt) throw new Error("A deleted library source already owns this PDF");
      const artifactRow = this.ctx.storage.sql
        .exec<ArtifactRow>("SELECT * FROM artifacts WHERE reference_id = ? AND fingerprint = ? LIMIT 1", reference.id, artifact.fingerprint)
        .toArray()[0];
      if (!artifactRow) throw new Error("The library source for this PDF no longer has its artifact");
      return { reference, artifact: artifactFromRow(artifactRow), created: false };
    }
    const now = artifact.createdAt;
    const titleProvenance: MetadataFieldProvenance = { method: "filename", capturedAt: now, actor };
    const typeProvenance: MetadataFieldProvenance = { method: "migration", capturedAt: now, actor };
    const title =
      artifact.name
        .replace(/\.pdf$/iu, "")
        .replaceAll(/[_-]+/gu, " ")
        .trim() || "Untitled PDF";
    const draft: BibliographicRecord = {
      id: crypto.randomUUID(),
      referenceKey: "",
      type: "misc",
      title,
      authors: [],
      year: "",
      venue: "",
      doi: "",
      url: "",
      abstract: "",
      provenance: { type: typeProvenance, title: titleProvenance },
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const reference = { ...draft, referenceKey: this.#allocateReferenceKey(draft) };
    const identified = { ...artifact, referenceId: reference.id };
    this.ctx.storage.transactionSync(() => {
      this.#writeReference(reference, identityKey, true, "provisional");
      this.ctx.storage.sql.exec(
        `INSERT INTO artifacts (id, reference_id, name, content_type, size, object_key, fingerprint, rights, created_at)
         VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?)`,
        identified.id,
        identified.referenceId,
        identified.name,
        identified.size,
        identified.objectKey,
        identified.fingerprint,
        identified.rights,
        identified.createdAt,
      );
    });
    return { reference, artifact: identified, created: true };
  }

  // Invoked across the Durable Object RPC boundary.
  attachPdf(referenceId: string, artifact: LibraryPdfArtifact): PdfDraftResult {
    const reference = this.#reference(referenceId);
    if (reference.deletedAt) throw new Error("Library reference not found");
    if (artifact.referenceId !== referenceId) throw new Error("Imported PDF must identify the selected reference");
    const existingRow = this.ctx.storage.sql
      .exec<ArtifactRow>("SELECT * FROM artifacts WHERE fingerprint = ? LIMIT 1", artifact.fingerprint)
      .toArray()[0];
    if (existingRow) {
      const existing = artifactFromRow(existingRow);
      if (existing.referenceId !== referenceId) throw new Error("This PDF is already attached to another Library reference");
      return { reference, artifact: existing, created: false };
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO artifacts (id, reference_id, name, content_type, size, object_key, fingerprint, rights, created_at)
       VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?)`,
      artifact.id,
      referenceId,
      artifact.name,
      artifact.size,
      artifact.objectKey,
      artifact.fingerprint,
      artifact.rights,
      artifact.createdAt,
    );
    return { reference, artifact, created: true };
  }

  // Invoked across the Durable Object RPC boundary.
  getArtifactAnalysis(artifactId: string, kind: ArtifactAnalysisKind): ArtifactAnalysis | null {
    return this.#artifactAnalyses.get(artifactId, kind);
  }

  // Invoked across the Durable Object RPC boundary.
  async queueArtifactAnalysis(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    requestedAt: string,
    force = false,
  ): Promise<ArtifactAnalysis> {
    return (await this.#reserveArtifactAnalysisQueuePublication(artifactId, kind, requestedAt, force)).analysis;
  }

  // Versioned replacement for queueArtifactAnalysis across the Durable Object RPC boundary.
  async reserveArtifactAnalysisQueuePublication(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    requestedAt: string,
    force = false,
  ): Promise<ArtifactAnalysisQueueReservation> {
    return await this.#reserveArtifactAnalysisQueuePublication(artifactId, kind, requestedAt, force);
  }

  // Invoked across the Durable Object RPC boundary after Queue confirms durable acceptance.
  confirmArtifactAnalysisQueuePublication(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    fingerprint: string,
    requestedAt: string,
  ): boolean {
    return this.ctx.storage.transactionSync(() => this.#artifactAnalyses.confirmPublication(artifactId, kind, fingerprint, requestedAt));
  }

  // Invoked across the Durable Object RPC boundary.
  startArtifactAnalysis(artifactId: string, kind: ArtifactAnalysisKind, fingerprint: string, requestedAt: string): boolean {
    return this.ctx.storage.transactionSync(() => this.#artifactAnalyses.start(artifactId, kind, fingerprint, requestedAt));
  }

  // Invoked across the Durable Object RPC boundary.
  completeArtifactAnalysis(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    fingerprint: string,
    requestedAt: string,
    result: ArtifactAnalysisResult,
  ): boolean {
    return this.ctx.storage.transactionSync(() => this.#artifactAnalyses.complete(artifactId, kind, fingerprint, requestedAt, result));
  }

  // Invoked across the Durable Object RPC boundary.
  failArtifactAnalysis(artifactId: string, kind: ArtifactAnalysisKind, fingerprint: string, requestedAt: string, error: string): boolean {
    return this.ctx.storage.transactionSync(() => this.#artifactAnalyses.fail(artifactId, kind, fingerprint, requestedAt, error));
  }

  override async alarm(): Promise<void> {
    const jobs = this.#artifactAnalyses.pendingPublications(100);
    if (jobs.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    try {
      await this.env.ARTIFACT_ANALYSIS_QUEUE.sendBatch(jobs.map((body) => ({ body, contentType: "json" as const })));
    } catch (error) {
      console.error("Artifact analysis outbox publication failed", error);
      await this.#scheduleArtifactAnalysisPublicationAlarm(artifactAnalysisPublicationRetryMilliseconds);
      return;
    }
    this.ctx.storage.transactionSync(() => {
      for (const job of jobs) {
        this.#artifactAnalyses.confirmPublication(job.artifactId, job.kind, job.fingerprint, job.requestedAt);
      }
    });
    if (this.#artifactAnalyses.hasPendingPublications()) {
      await this.#scheduleArtifactAnalysisPublicationAlarm(artifactAnalysisPublicationDelayMilliseconds);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  identifyPdf(artifactId: string, referenceId: string): LibraryPdfArtifact {
    const reference = this.#reference(referenceId);
    const missing = missingRequiredBibliographicFields(reference);
    if (missing.length > 0)
      throw new Error(`Complete required ${reference.type} fields before identifying this PDF: ${missing.join(", ")}`);
    const artifact = this.#artifact(artifactId);
    if (artifact.referenceId && artifact.referenceId !== referenceId) throw new Error("PDF is already identified as another source");
    this.ctx.storage.sql.exec("UPDATE artifacts SET reference_id = ? WHERE id = ?", referenceId, artifactId);
    return { ...artifact, referenceId };
  }

  setTags(referenceId: string, tags: readonly string[]): readonly string[] {
    this.#reference(referenceId);
    const byKey = new Map<string, string>();
    for (const tag of tags.map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 64)) {
      if (!byKey.has(tag.toLocaleLowerCase())) byKey.set(tag.toLocaleLowerCase(), tag);
    }
    const normalized = [...byKey.values()].slice(0, 64);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM reference_tags WHERE reference_id = ?", referenceId);
      for (const tag of normalized)
        this.ctx.storage.sql.exec("INSERT INTO reference_tags (reference_id, tag) VALUES (?, ?)", referenceId, tag);
    });
    return normalized;
  }

  createNote(referenceId: string, bodyValue: string): LibraryNote {
    this.#reference(referenceId);
    const body = bodyValue.trim();
    if (!body || body.length > 20_000) throw new Error("Reference note must contain at most 20,000 characters");
    const now = new Date().toISOString();
    const note: LibraryNote = { id: crypto.randomUUID(), referenceId, body, createdAt: now, updatedAt: now };
    this.ctx.storage.sql.exec(
      "INSERT INTO notes (id, reference_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      note.id,
      referenceId,
      body,
      now,
      now,
    );
    return note;
  }

  createHighlight(
    referenceId: string,
    artifactId: string,
    page: number,
    quoteValue: string,
    commentValue: string,
    rectsValue: unknown,
  ): LibraryHighlight {
    this.#reference(referenceId);
    const artifact = this.#artifact(artifactId);
    if (artifact.referenceId !== referenceId) throw new Error("PDF is not identified as this reference");
    const quote = quoteValue.trim();
    const comment = commentValue.trim();
    const rects = parsePdfRects(rectsValue);
    if (!Number.isInteger(page) || page < 1 || !quote || quote.length > 20_000 || comment.length > 8_000 || !rects?.length) {
      throw new Error("Invalid private highlight");
    }
    const now = new Date().toISOString();
    const overlapping = this.ctx.storage.sql
      .exec<HighlightRow>(
        "SELECT * FROM highlights WHERE reference_id = ? AND artifact_id = ? AND page = ? ORDER BY updated_at DESC, id",
        referenceId,
        artifactId,
        page,
      )
      .toArray()
      .find((row) => libraryPdfRectsOverlap(parsePdfRectsJson(row.rects_json), rects));
    if (overlapping) {
      const mergedRects = mergeLibraryPdfRects(parsePdfRectsJson(overlapping.rects_json), rects);
      const mergedQuote = mergeLibraryHighlightQuote(overlapping.quote, quote);
      const mergedComment = mergeHighlightComments(overlapping.comment, comment);
      if (mergedRects.length > 512 || mergedQuote.length > 20_000 || mergedComment.length > 8_000) {
        throw new Error("Merged private highlight exceeds its limits");
      }
      this.ctx.storage.sql.exec(
        "UPDATE highlights SET quote = ?, comment = ?, rects_json = ?, updated_at = ? WHERE id = ?",
        mergedQuote,
        mergedComment,
        JSON.stringify(mergedRects),
        now,
        overlapping.id,
      );
      return highlightFromRow({
        ...overlapping,
        quote: mergedQuote,
        comment: mergedComment,
        rects_json: JSON.stringify(mergedRects),
        updated_at: now,
      });
    }
    const highlight: LibraryHighlight = {
      id: crypto.randomUUID(),
      referenceId,
      artifactId,
      page,
      quote,
      comment,
      rects,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO highlights (id, reference_id, artifact_id, page, quote, comment, rects_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      highlight.id,
      referenceId,
      artifactId,
      page,
      quote,
      comment,
      JSON.stringify(rects),
      now,
      now,
    );
    return highlight;
  }

  importHighlights(referenceId: string, artifactId: string, candidates: readonly LibraryHighlightImportCandidate[]): LibraryHighlight[] {
    if (candidates.length < 1 || candidates.length > 128) throw new Error("Import between 1 and 128 PDF highlights");
    return this.ctx.storage.transactionSync(() =>
      candidates.map((candidate) =>
        this.createHighlight(referenceId, artifactId, candidate.page, candidate.quote, candidate.comment, candidate.rects),
      ),
    );
  }

  updateHighlightComment(referenceId: string, highlightId: string, commentValue: string): LibraryHighlight {
    const row = this.ctx.storage.sql
      .exec<HighlightRow>("SELECT * FROM highlights WHERE id = ? AND reference_id = ?", highlightId, referenceId)
      .toArray()[0];
    const comment = commentValue.trim();
    if (!row || comment.length > 8_000) throw new Error("Invalid private highlight comment");
    const updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec("UPDATE highlights SET comment = ?, updated_at = ? WHERE id = ?", comment, updatedAt, highlightId);
    return highlightFromRow({ ...row, comment, updated_at: updatedAt });
  }

  updatePdfNote(referenceId: string, markupId: string, x: number, y: number, bodyValue?: string): LibraryPdfNote {
    const row = this.ctx.storage.sql
      .exec<PdfMarkupRow>("SELECT * FROM pdf_markups WHERE id = ? AND reference_id = ?", markupId, referenceId)
      .toArray()[0];
    const body = bodyValue === undefined ? row?.body : bodyValue.trim();
    if (!row || row.kind !== "note" || !normalizedCoordinate(x) || !normalizedCoordinate(y) || !body || body.length > 8_000) {
      throw new Error("Invalid private PDF note position");
    }
    const updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE pdf_markups SET x = ?, y = ?, body = ?, updated_at = ? WHERE id = ?",
      x,
      y,
      body,
      updatedAt,
      markupId,
    );
    return pdfMarkupFromRow({ ...row, x, y, body, updated_at: updatedAt }) as LibraryPdfNote;
  }

  updatePdfDrawing(referenceId: string, markupId: string, colorValue: string, width: number): LibraryPdfDrawing {
    const row = this.ctx.storage.sql
      .exec<PdfMarkupRow>("SELECT * FROM pdf_markups WHERE id = ? AND reference_id = ?", markupId, referenceId)
      .toArray()[0];
    const color = colorValue.toLocaleLowerCase();
    if (!row || row.kind !== "drawing" || !/^#[0-9a-f]{6}$/u.test(color) || !Number.isFinite(width) || width < 1 || width > 24) {
      throw new Error("Invalid private PDF drawing style");
    }
    const updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE pdf_markups SET color = ?, width = ?, updated_at = ? WHERE id = ?",
      color,
      width,
      updatedAt,
      markupId,
    );
    return pdfMarkupFromRow({ ...row, color, width, updated_at: updatedAt }) as LibraryPdfDrawing;
  }

  createPdfNote(referenceId: string, artifactId: string, page: number, x: number, y: number, bodyValue: string): LibraryPdfNote {
    this.#reference(referenceId);
    const artifact = this.#artifact(artifactId);
    const body = bodyValue.trim();
    if (
      artifact.referenceId !== referenceId ||
      !Number.isInteger(page) ||
      page < 1 ||
      !normalizedCoordinate(x) ||
      !normalizedCoordinate(y) ||
      !body ||
      body.length > 8_000
    ) {
      throw new Error("Invalid private PDF note");
    }
    const now = new Date().toISOString();
    const note: LibraryPdfNote = {
      id: crypto.randomUUID(),
      referenceId,
      artifactId,
      page,
      kind: "note",
      x,
      y,
      body,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO pdf_markups
       (id, reference_id, artifact_id, page, kind, x, y, body, color, width, points_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'note', ?, ?, ?, '', NULL, '[]', ?, ?)`,
      note.id,
      referenceId,
      artifactId,
      page,
      x,
      y,
      body,
      now,
      now,
    );
    return note;
  }

  createPdfDrawing(
    referenceId: string,
    artifactId: string,
    page: number,
    colorValue: string,
    width: number,
    points: readonly LibraryPdfPoint[],
    mutationId: string,
  ): LibraryPdfDrawing {
    this.#reference(referenceId);
    const artifact = this.#artifact(artifactId);
    const color = colorValue.toLocaleLowerCase();
    const mutation = { referenceId, artifactId, page, color, width, points } satisfies PdfDrawingMutationInput;
    if (!validPdfDrawingMutation(artifact.referenceId, mutationId, mutation)) throw new Error("Invalid private PDF drawing");
    const drawingPoints = points.map((point) => ({ x: point.x, y: point.y }));
    const existingRow = this.ctx.storage.sql.exec<PdfMarkupRow>("SELECT * FROM pdf_markups WHERE id = ?", mutationId).toArray()[0];
    if (existingRow) {
      const existing = pdfMarkupFromRow(existingRow);
      if (!samePdfDrawingMutation(existing, { ...mutation, points: drawingPoints }))
        throw new Error("Private PDF drawing mutation conflict");
      return existing;
    }
    const now = new Date().toISOString();
    const drawing: LibraryPdfDrawing = {
      id: mutationId,
      referenceId,
      artifactId,
      page,
      kind: "drawing",
      color,
      width,
      points: drawingPoints,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO pdf_markups
       (id, reference_id, artifact_id, page, kind, x, y, body, color, width, points_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'drawing', NULL, NULL, '', ?, ?, ?, ?, ?)`,
      drawing.id,
      referenceId,
      artifactId,
      page,
      color,
      width,
      JSON.stringify(drawing.points),
      now,
      now,
    );
    return drawing;
  }

  deletePdfMarkup(referenceId: string, markupId: string): LibraryPdfMarkup | null {
    this.#reference(referenceId);
    const row = this.ctx.storage.sql
      .exec<PdfMarkupRow>("SELECT * FROM pdf_markups WHERE id = ? AND reference_id = ?", markupId, referenceId)
      .toArray()[0];
    if (!row) return null;
    this.ctx.storage.sql.exec("DELETE FROM pdf_markups WHERE id = ? AND reference_id = ?", markupId, referenceId);
    return pdfMarkupFromRow(row);
  }

  setArtifactRights(artifactId: string, rights: LibraryPdfArtifact["rights"]): LibraryPdfArtifact {
    if (rights !== "private" && rights !== "shareable" && rights !== "unknown") throw new Error("Invalid artifact rights");
    const artifact = this.#artifact(artifactId);
    this.ctx.storage.sql.exec("UPDATE artifacts SET rights = ? WHERE id = ?", rights, artifactId);
    return { ...artifact, rights };
  }

  shareResearch(projectId: string, referenceId: string, kind: ResearchShareKind, resourceId: string): ResearchShareSnapshot {
    this.#reference(referenceId);
    const existing = this.ctx.storage.sql
      .exec<ShareRow>("SELECT * FROM research_shares WHERE project_id = ? AND kind = ? AND resource_id = ?", projectId, kind, resourceId)
      .toArray()[0];
    if (existing && existing.revoked_at === null) return shareFromRow(existing);
    const content = this.#sharedContent(referenceId, kind, resourceId);
    const createdAt = new Date().toISOString();
    const share: ResearchShareSnapshot = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId,
      referenceId,
      resourceId,
      kind,
      content,
      createdAt,
      revokedAt: null,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO research_shares (id, project_id, reference_id, resource_id, kind, snapshot_json, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(project_id, kind, resource_id) DO UPDATE SET snapshot_json = excluded.snapshot_json,
       created_at = excluded.created_at, revoked_at = NULL`,
      share.id,
      projectId,
      referenceId,
      resourceId,
      kind,
      JSON.stringify(content),
      createdAt,
    );
    return share;
  }

  revokeResearchShare(shareId: string): ResearchShareSnapshot {
    const row = this.ctx.storage.sql.exec<ShareRow>("SELECT * FROM research_shares WHERE id = ?", shareId).toArray()[0];
    if (!row) throw new Error("Research share not found");
    if (row.revoked_at) return shareFromRow(row);
    const revokedAt = new Date().toISOString();
    this.ctx.storage.sql.exec("UPDATE research_shares SET revoked_at = ? WHERE id = ?", revokedAt, shareId);
    return { ...shareFromRow(row), revokedAt };
  }

  setReadingState(
    referenceId: string,
    status: ReadingState["status"],
    rating: number | null,
    priority: ReadingState["priority"] = "normal",
  ): ReadingState {
    this.#reference(referenceId);
    if (!(["unread", "reading", "read"] as const).includes(status)) throw new Error("Invalid reading state");
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Rating must be between 1 and 5");
    if (!(["low", "normal", "high"] as const).includes(priority)) throw new Error("Invalid reading priority");
    const updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO reading_state (reference_id, status, rating, priority, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(reference_id) DO UPDATE SET status = excluded.status, rating = excluded.rating,
       priority = excluded.priority, updated_at = excluded.updated_at`,
      referenceId,
      status,
      rating,
      priority,
      updatedAt,
    );
    return { referenceId, status, rating, priority, updatedAt };
  }

  setCollections(referenceId: string, values: readonly string[]): string[] {
    this.#reference(referenceId);
    const collections = [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 32);
    if (collections.some((value) => value.length > 80)) throw new Error("Collection name is too long");
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM reference_collections WHERE reference_id = ?", referenceId);
      for (const collection of collections) {
        this.ctx.storage.sql.exec(
          "INSERT INTO reference_collections (reference_id, collection_name) VALUES (?, ?)",
          referenceId,
          collection,
        );
      }
    });
    return collections;
  }

  updateReferenceMetadata(
    referenceId: string,
    fields: Pick<BibliographicRecord, "type" | "title" | "authors" | "year" | "venue" | "doi" | "url" | "abstract">,
    actor: string,
  ): BibliographicRecord {
    const current = this.#reference(referenceId);
    const updatedAt = new Date().toISOString();
    const provenance = { ...current.provenance };
    for (const field of ["type", "title", "authors", "year", "venue", "doi", "url", "abstract"] as const) {
      provenance[field] = { method: "manual", capturedAt: updatedAt, actor };
    }
    const next: BibliographicRecord = { ...current, ...fields, provenance, updatedAt };
    if (!next.title.trim() || !next.type.trim()) throw new Error("Reference type and title are required");
    this.#writeEnrichedReference(next);
    this.#invalidateMetadataRefinementPreviews(referenceId);
    return this.#reference(referenceId);
  }

  applyReviewedPdfMetadata(referenceId: string, artifactId: string, fields: ReviewedPdfMetadata, actor: string): BibliographicRecord {
    const current = this.#reference(referenceId);
    const artifact = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE id = ?", artifactId).toArray()[0];
    if (!artifact || artifact.reference_id !== referenceId) throw new Error("PDF artifact does not belong to this reference");
    const normalized: ReviewedPdfMetadata = {
      ...(fields.title === undefined ? {} : { title: fields.title.trim() }),
      ...(fields.authors === undefined ? {} : { authors: fields.authors.map((author) => author.trim()).filter(Boolean) }),
      ...(fields.year === undefined ? {} : { year: fields.year.trim() }),
      ...(fields.doi === undefined ? {} : { doi: normalizeDoi(fields.doi) }),
    };
    const entries = Object.entries(normalized) as [keyof ReviewedPdfMetadata, string | readonly string[]][];
    if (entries.length === 0) throw new Error("Reviewed PDF metadata is empty");
    if (
      (normalized.title !== undefined && (!normalized.title || normalized.title.length > 2_000)) ||
      (normalized.authors !== undefined &&
        (normalized.authors.length > 64 || normalized.authors.some((author) => !author || author.length > 300))) ||
      (normalized.year !== undefined && normalized.year !== "" && !/^\d{4}$/u.test(normalized.year)) ||
      (normalized.doi !== undefined && normalized.doi.length > 500)
    ) {
      throw new Error("Reviewed PDF metadata is invalid");
    }
    const updatedAt = new Date().toISOString();
    const provenance = { ...current.provenance };
    for (const [field] of entries) provenance[field] = { method: "pdf-metadata", capturedAt: updatedAt, actor };
    const next = { ...current, ...normalized, provenance, updatedAt };
    if (!next.title.trim()) throw new Error("Reference title is required");
    this.#writeEnrichedReference(next);
    this.#invalidateMetadataRefinementPreviews(referenceId);
    return this.#reference(referenceId);
  }

  getPdfMetadataContext(referenceId: string, artifactId: string): { reference: BibliographicRecord; artifact: LibraryPdfArtifact } {
    const reference = this.#reference(referenceId);
    const row = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE id = ?", artifactId).toArray()[0];
    if (!row || row.reference_id !== referenceId) throw new Error("PDF artifact does not belong to this reference");
    return { reference, artifact: artifactFromRow(row) };
  }

  getMetadataRefinementPreview(cacheKey: string): MetadataRefinementPreview | null {
    if (!cacheKey || cacheKey.length > 20_000) return null;
    const entry = this.#metadataPreviewCache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#metadataPreviewCache.delete(cacheKey);
      return null;
    }
    return entry.preview;
  }

  cacheMetadataRefinementPreview(cacheKey: string, preview: MetadataRefinementPreview): void {
    if (!cacheKey || cacheKey.length > 20_000 || !isMetadataRefinementPreview(preview)) {
      throw new Error("Metadata refinement preview cache entry is invalid");
    }
    const now = Date.now();
    for (const [key, entry] of this.#metadataPreviewCache) {
      if (entry.expiresAt <= now) this.#metadataPreviewCache.delete(key);
    }
    this.#metadataPreviewCache.delete(cacheKey);
    while (this.#metadataPreviewCache.size >= maximumMetadataPreviewCacheEntries) {
      const oldestKey = this.#metadataPreviewCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.#metadataPreviewCache.delete(oldestKey);
    }
    this.#metadataPreviewCache.set(cacheKey, { preview, expiresAt: now + metadataPreviewCacheTtlMilliseconds });
  }

  applyReviewedCrossrefMetadata(
    referenceId: string,
    expectedDoiValue: string,
    metadata: CrossrefMetadata,
    fields: readonly CrossrefMetadataField[],
    actor: string,
  ): BibliographicRecord {
    const current = this.#reference(referenceId);
    const expectedDoi = normalizeDoi(expectedDoiValue);
    if (!expectedDoi || normalizeDoi(current.doi) !== expectedDoi || normalizeDoi(metadata.doi) !== expectedDoi) {
      throw new Error("Reference DOI changed; review Crossref metadata again");
    }
    if (
      fields.length === 0 ||
      fields.length > crossrefMetadataFields.length ||
      new Set(fields).size !== fields.length ||
      fields.some((field) => !crossrefMetadataFields.includes(field)) ||
      !isCrossrefMetadata(metadata)
    ) {
      throw new Error("Reviewed Crossref metadata is invalid");
    }
    return this.applyReviewedProviderMetadata(referenceId, metadata, fields, "crossref", actor);
  }

  applyReviewedProviderMetadata(
    referenceId: string,
    metadata: CrossrefMetadata,
    fields: readonly CrossrefMetadataField[],
    provider: ScholarlyMetadataProvider,
    actor: string,
  ): BibliographicRecord {
    return this.applyReviewedProviderMetadataBatch(referenceId, [{ metadata, fields, provider }], actor);
  }

  applyReviewedProviderMetadataBatch(
    referenceId: string,
    selections: readonly ReviewedProviderMetadataSelection[],
    actor: string,
  ): BibliographicRecord {
    const current = this.#reference(referenceId);
    const providerDoi = normalizeDoi(selections[0]?.metadata.doi ?? "");
    const currentDoi = normalizeDoi(current.doi);
    if (selections.length === 0 || selections.length > 4 || !providerDoi || (currentDoi && currentDoi !== providerDoi)) {
      throw new Error("Reference DOI changed; review provider metadata again");
    }
    const allFields = selections.flatMap(({ fields }) => fields);
    const sources = new Set<string>();
    const valid = selections.every(({ metadata, fields, provider }) => {
      const source = `${provider}:${normalizeDoi(metadata.doi)}`;
      if (sources.has(source)) return false;
      sources.add(source);
      return (
        (["openalex", "crossref", "datacite", "semantic-scholar"] as const).includes(provider) &&
        normalizeDoi(metadata.doi) === providerDoi &&
        fields.length > 0 &&
        fields.length <= crossrefMetadataFields.length &&
        new Set(fields).size === fields.length &&
        fields.every((field) => crossrefMetadataFields.includes(field)) &&
        isCrossrefMetadata(metadata)
      );
    });
    if (!valid || allFields.length > crossrefMetadataFields.length || new Set(allFields).size !== allFields.length) {
      throw new Error("Reviewed provider metadata is invalid");
    }
    const duplicate = this.ctx.storage.sql
      .exec<ReferenceRow>(
        "SELECT * FROM library_references WHERE LOWER(doi) = ? AND id <> ? AND deleted_at IS NULL LIMIT 1",
        providerDoi,
        referenceId,
      )
      .toArray()[0];
    if (duplicate) throw new Error("DOI already belongs to another library record");
    const updatedAt = new Date().toISOString();
    const provenance = { ...current.provenance };
    const selected: Partial<CrossrefMetadata> = {};
    for (const { metadata, fields, provider } of selections) {
      for (const field of fields) provenance[field] = { method: provider, capturedAt: updatedAt, actor };
      Object.assign(selected, {
        ...(fields.includes("type") ? { type: metadata.type } : {}),
        ...(fields.includes("title") ? { title: metadata.title } : {}),
        ...(fields.includes("authors") ? { authors: metadata.authors } : {}),
        ...(fields.includes("year") ? { year: metadata.year } : {}),
        ...(fields.includes("venue") ? { venue: metadata.venue } : {}),
        ...(fields.includes("doi") ? { doi: providerDoi } : {}),
        ...(fields.includes("url") ? { url: metadata.url } : {}),
        ...(fields.includes("abstract") ? { abstract: metadata.abstract } : {}),
      });
    }
    const next: BibliographicRecord = { ...current, ...selected, provenance, updatedAt };
    if (!next.title.trim() || !next.type.trim()) throw new Error("Reference type and title are required");
    this.#writeEnrichedReference(next);
    this.#invalidateMetadataRefinementPreviews(referenceId);
    return this.#reference(referenceId);
  }

  archiveReference(referenceId: string, archived: boolean): BibliographicRecord {
    this.#reference(referenceId);
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE library_references SET archived_at = ?, updated_at = ? WHERE id = ?",
      archived ? now : null,
      now,
      referenceId,
    );
    return this.#reference(referenceId);
  }

  registerProjectDependency(projectId: string, referenceId: string): void {
    this.#reference(referenceId);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE library_references SET reference_key_state = 'final'
         WHERE id = ? AND reference_key_state = 'provisional'
           AND NOT EXISTS (SELECT 1 FROM artifacts WHERE artifacts.reference_id = library_references.id)`,
        referenceId,
      );
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO project_dependencies (project_id, reference_id, linked_at) VALUES (?, ?, ?)",
        projectId,
        referenceId,
        new Date().toISOString(),
      );
    });
  }

  unregisterProjectDependency(projectId: string, referenceId: string): void {
    this.ctx.storage.sql.exec("DELETE FROM project_dependencies WHERE project_id = ? AND reference_id = ?", projectId, referenceId);
  }

  getDeletionImpact(referenceId: string): ReferenceDeletionImpact {
    this.#reference(referenceId);
    return {
      referenceId,
      projectIds: this.ctx.storage.sql
        .exec<ProjectDependencyRow>("SELECT project_id FROM project_dependencies WHERE reference_id = ? ORDER BY project_id", referenceId)
        .toArray()
        .map((row) => row.project_id),
      artifactCount: this.#count("artifacts", referenceId),
      noteCount: this.#count("notes", referenceId),
      highlightCount: this.#count("highlights", referenceId),
      pdfMarkupCount: this.#count("pdf_markups", referenceId),
      webSnapshotCount: this.ctx.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM web_snapshots WHERE reference_id = ?", referenceId)
        .one().count,
    };
  }

  permanentlyDeleteReference(referenceId: string, expectedProjectIds: readonly string[]): BibliographicRecord {
    const impact = this.getDeletionImpact(referenceId);
    if (JSON.stringify(impact.projectIds) !== JSON.stringify([...expectedProjectIds].sort())) {
      throw new Error("Reference dependencies changed; review deletion impact again");
    }
    const previous = this.#reference(referenceId);
    const deletedAt = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM pdf_markups WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM highlights WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM notes WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM reference_tags WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM reading_state WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM artifacts WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM web_snapshots WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec("DELETE FROM web_sources WHERE reference_id = ?", referenceId);
      this.ctx.storage.sql.exec(
        `UPDATE library_references SET authors_json = '[]', venue = '', doi = '', url = '', abstract = '', provenance_json = '{}',
         archived_at = NULL, deleted_at = ?, updated_at = ? WHERE id = ?`,
        deletedAt,
        deletedAt,
        referenceId,
      );
    });
    return {
      ...previous,
      authors: [],
      venue: "",
      doi: "",
      url: "",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt,
      updatedAt: deletedAt,
    };
  }

  #createCitationAssertion(input: CreateCitationAssertionInput, actor: string): CitationAssertion {
    this.#reference(input.citingReferenceId);
    this.#reference(input.citedReferenceId);
    const existing = this.ctx.storage.sql
      .exec<CitationAssertionRow>(
        `SELECT * FROM citation_assertions WHERE citing_reference_id = ? AND cited_reference_id = ? AND polarity = ?
         AND extraction_method = ? AND source_kind = ? AND source_id = ?`,
        input.citingReferenceId,
        input.citedReferenceId,
        input.polarity,
        input.method,
        input.sourceKind,
        input.sourceId,
      )
      .toArray()[0];
    if (existing) return citationAssertionFromRow(existing);
    const assertion: CitationAssertion = {
      id: crypto.randomUUID(),
      ...input,
      assertedBy: actor,
      review: null,
      createdAt: new Date().toISOString(),
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO citation_assertions
       (id, citing_reference_id, cited_reference_id, polarity, evidence_state, extraction_method, asserted_by,
        observed_at, source_kind, source_id, source_locator, confidence, review_decision, reviewed_by,
        reviewed_at, review_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
      assertion.id,
      assertion.citingReferenceId,
      assertion.citedReferenceId,
      assertion.polarity,
      assertion.evidenceState,
      assertion.method,
      assertion.assertedBy,
      assertion.observedAt,
      assertion.sourceKind,
      assertion.sourceId,
      assertion.sourceLocator,
      assertion.confidence,
      assertion.createdAt,
    );
    return assertion;
  }

  #validateCitationCandidateBatch(seedReferenceId: string, metadata: readonly CrossrefMetadata[], source: CitationCandidateSource): void {
    const seedReference = this.#reference(seedReferenceId);
    const normalizedDois = metadata.map(({ doi }) => normalizeDoi(doi));
    if (
      metadata.length === 0 ||
      metadata.length > 25 ||
      metadata.some((candidate) => !isCrossrefMetadata(candidate)) ||
      normalizedDois.some((doi) => !doi || doi === normalizeDoi(seedReference.doi)) ||
      new Set(normalizedDois).size !== normalizedDois.length ||
      !(
        (source.provider === "crossref" && source.direction === "references") ||
        (source.provider === "semantic-scholar" && source.direction === "citations")
      ) ||
      !Number.isFinite(Date.parse(source.observedAt)) ||
      !/^sha256:[a-f0-9]{64}$/u.test(source.responseId) ||
      !source.sourceLocator ||
      source.sourceLocator.length > 2_000
    ) {
      throw new Error("Citation candidate is invalid");
    }
  }

  #acceptCitationCandidate(
    seedReferenceId: string,
    metadata: CrossrefMetadata,
    source: CitationCandidateSource,
    actor: string,
  ): CitationCandidateAcceptance {
    const doi = normalizeDoi(metadata.doi);
    const existing = this.ctx.storage.sql
      .exec<ReferenceRow>("SELECT * FROM library_references WHERE LOWER(doi) = ? AND deleted_at IS NULL LIMIT 1", doi)
      .toArray()[0];
    const created = existing === undefined;
    const reference = existing
      ? referenceFromRow(existing)
      : this.#createCitationCandidateReference(metadata, source.provider, source.observedAt, actor);
    const assertion = this.#createCitationAssertion(
      {
        citingReferenceId: source.direction === "references" ? seedReferenceId : reference.id,
        citedReferenceId: source.direction === "references" ? reference.id : seedReferenceId,
        polarity: "cites",
        evidenceState: "extracted",
        method: "provider",
        observedAt: source.observedAt,
        sourceKind: "provider-response",
        sourceId: source.responseId,
        sourceLocator: source.sourceLocator,
        confidence: null,
      },
      source.provider === "crossref" ? "Crossref" : "Semantic Scholar",
    );
    return { reference, created, assertion };
  }

  #createCitationCandidateReference(
    metadata: CrossrefMetadata,
    provider: "crossref" | "semantic-scholar",
    capturedAt: string,
    actor: string,
  ): BibliographicRecord {
    const provenance: MetadataFieldProvenance = { method: provider, capturedAt, actor };
    const now = new Date().toISOString();
    const draft: BibliographicRecord = {
      id: crypto.randomUUID(),
      referenceKey: "",
      type: metadata.type,
      title: metadata.title,
      authors: [...metadata.authors],
      year: metadata.year,
      venue: metadata.venue,
      doi: normalizeDoi(metadata.doi),
      url: metadata.url,
      abstract: metadata.abstract,
      provenance: {
        type: provenance,
        title: provenance,
        ...(metadata.authors.length > 0 ? { authors: provenance } : {}),
        ...(metadata.year ? { year: provenance } : {}),
        ...(metadata.venue ? { venue: provenance } : {}),
        doi: provenance,
        ...(metadata.url ? { url: provenance } : {}),
        ...(metadata.abstract ? { abstract: provenance } : {}),
      },
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const reference = { ...draft, referenceKey: this.#allocateReferenceKey(draft) };
    this.#writeReference(reference, likelyReferenceIdentity(reference), true);
    return reference;
  }

  #createPdfReferenceCandidate(
    artifactId: string,
    candidate: import("../domain/reference-library").PdfReferenceAnalysisCandidate,
    capturedAt: string,
    actor: string,
  ): BibliographicRecord {
    const provenance: MetadataFieldProvenance = { method: "pdf-reference", capturedAt, actor };
    const now = new Date().toISOString();
    const title = (candidate.title || candidate.raw).trim().slice(0, 2_000);
    const draft: BibliographicRecord = {
      id: crypto.randomUUID(),
      referenceKey: "",
      type: "misc",
      title,
      authors: [...candidate.authors],
      year: candidate.year,
      venue: "",
      doi: normalizeDoi(candidate.doi),
      url: candidate.url,
      abstract: "",
      provenance: {
        type: provenance,
        title: provenance,
        ...(candidate.authors.length > 0 ? { authors: provenance } : {}),
        ...(candidate.year ? { year: provenance } : {}),
        ...(candidate.doi ? { doi: provenance } : {}),
        ...(candidate.url ? { url: provenance } : {}),
      },
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const reference = { ...draft, referenceKey: this.#allocateReferenceKey(draft) };
    const identity = reference.doi ? likelyReferenceIdentity(reference) : `pdf-reference:${artifactId}:${candidate.id}`;
    this.#writeReference(reference, identity, true);
    return reference;
  }

  #writePdfReferenceReview(
    artifactId: string,
    fingerprint: string,
    candidateId: string,
    decision: "accepted" | "rejected",
    referenceId: string | null,
    assertionId: string | null,
    actor: string,
  ): PdfReferenceCandidateReview {
    const reviewedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO pdf_reference_reviews
         (artifact_id, fingerprint, candidate_id, decision, reference_id, assertion_id, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (artifact_id, candidate_id) DO UPDATE SET
         fingerprint = excluded.fingerprint,
         decision = excluded.decision,
         reference_id = excluded.reference_id,
         assertion_id = excluded.assertion_id,
         reviewed_by = excluded.reviewed_by,
         reviewed_at = excluded.reviewed_at`,
      artifactId,
      fingerprint,
      candidateId,
      decision,
      referenceId,
      assertionId,
      actor,
      reviewedAt,
    );
    return { candidateId, decision, referenceId, assertionId, reviewedBy: actor, reviewedAt };
  }

  #citationAssertion(assertionId: string): CitationAssertionRow {
    const row = this.ctx.storage.sql.exec<CitationAssertionRow>("SELECT * FROM citation_assertions WHERE id = ?", assertionId).toArray()[0];
    if (!row) throw new Error("Citation assertion not found");
    return row;
  }

  #writeReference(
    reference: BibliographicRecord,
    identityKey: string,
    insert: boolean,
    referenceKeyState: ReferenceKeyState = "final",
  ): void {
    if (insert) {
      this.ctx.storage.sql.exec(
        `INSERT INTO library_references
         (id, reference_key, reference_key_state, identity_key, entry_type, title, authors_json, publication_year, venue, doi, url, abstract,
          provenance_json, archived_at, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        reference.id,
        reference.referenceKey,
        referenceKeyState,
        identityKey,
        reference.type,
        reference.title,
        JSON.stringify(reference.authors),
        reference.year,
        reference.venue,
        reference.doi,
        reference.url,
        reference.abstract,
        JSON.stringify(reference.provenance),
        reference.createdAt,
        reference.updatedAt,
      );
      return;
    }
    this.ctx.storage.sql.exec(
      `UPDATE library_references SET reference_key = ?, reference_key_state = ?, identity_key = ?, entry_type = ?, title = ?, authors_json = ?, publication_year = ?, venue = ?,
       doi = ?, url = ?, abstract = ?, provenance_json = ?, archived_at = NULL, deleted_at = NULL, updated_at = ? WHERE id = ?`,
      reference.referenceKey,
      referenceKeyState,
      identityKey,
      reference.type,
      reference.title,
      JSON.stringify(reference.authors),
      reference.year,
      reference.venue,
      reference.doi,
      reference.url,
      reference.abstract,
      JSON.stringify(reference.provenance),
      reference.updatedAt,
      reference.id,
    );
  }

  #writeEnrichedReference(reference: BibliographicRecord): void {
    const row = this.ctx.storage.sql.exec<ReferenceRow>("SELECT * FROM library_references WHERE id = ?", reference.id).one();
    const referenceKeyState = referenceKeyStateFromRow(row);
    const next = referenceKeyState === "provisional" ? { ...reference, referenceKey: this.#allocateReferenceKey(reference) } : reference;
    this.#writeReference(next, likelyReferenceIdentity(next), false, referenceKeyState);
  }

  #invalidateMetadataRefinementPreviews(referenceId: string): void {
    for (const [key, entry] of this.#metadataPreviewCache) {
      if (entry.preview.referenceId === referenceId) this.#metadataPreviewCache.delete(key);
    }
  }

  #reference(referenceId: string, includeDeleted = false): BibliographicRecord {
    const row = this.ctx.storage.sql.exec<ReferenceRow>("SELECT * FROM library_references WHERE id = ?", referenceId).toArray()[0];
    if (!row || (!includeDeleted && row.deleted_at !== null)) throw new Error("Reference not found");
    return referenceFromRow(row);
  }

  #allocateReferenceKey(reference: Pick<BibliographicRecord, "id" | "title" | "authors" | "year">): string {
    const available = (candidate: string): boolean =>
      !this.ctx.storage.sql
        .exec<{
          id: string;
        }>("SELECT id FROM library_references WHERE reference_key = ? COLLATE NOCASE AND id <> ? LIMIT 1", candidate, reference.id)
        .toArray()[0];
    const base = memorableReferenceKey(reference);
    if (available(base)) return base;
    const topical = memorableReferenceKey(reference, true);
    if (available(topical)) return topical;
    for (let index = 2; index <= 9_999; index += 1) {
      const suffix = String(index);
      const candidate = `${topical.slice(0, 80 - suffix.length)}${suffix}`;
      if (available(candidate)) return candidate;
    }
    throw new Error("Unable to allocate a unique reference key");
  }

  #backfillReferenceKeys(): void {
    const rows = this.ctx.storage.sql
      .exec<ReferenceRow>("SELECT * FROM library_references WHERE reference_key IS NULL ORDER BY created_at, id")
      .toArray();
    for (const row of rows) {
      const reference = referenceFromRow(row);
      this.ctx.storage.sql.exec(
        "UPDATE library_references SET reference_key = ? WHERE id = ?",
        this.#allocateReferenceKey(reference),
        row.id,
      );
    }
  }

  #artifact(artifactId: string): LibraryPdfArtifact {
    const row = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE id = ?", artifactId).toArray()[0];
    if (!row) throw new Error("PDF artifact not found");
    return artifactFromRow(row);
  }

  #pdfArtifactItems(rows: readonly ArtifactRow[]): { readonly items: LibraryPdfCatalogItem[]; readonly truncated: boolean } {
    const items: LibraryPdfCatalogItem[] = [];
    let byteLength = 1_024;
    for (const row of rows) {
      const artifact = artifactFromRow(row);
      const item = projectLibraryPdfCatalogItem({
        artifact,
        reference: artifact.referenceId ? this.#reference(artifact.referenceId) : null,
      });
      const itemByteLength = libraryPdfCatalogItemByteLength(item);
      if (byteLength + itemByteLength > maximumLibraryPdfArtifactPageBytes) {
        if (items.length === 0) throw new Error("PDF artifact catalog item exceeds its RPC byte budget");
        return { items, truncated: true };
      }
      items.push(item);
      byteLength += itemByteLength;
    }
    return { items, truncated: false };
  }

  #pdfArtifactPageRows(after: string | null, limit: number): ArtifactRow[] | null {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("PDF artifact page size must be between 1 and 100");
    const eligible = "a.reference_id IS NULL OR (r.id IS NOT NULL AND r.deleted_at IS NULL)";
    const cursor = after
      ? this.ctx.storage.sql
          .exec<{ id: string; created_at: string }>(
            `SELECT a.id, a.created_at FROM artifacts a
             LEFT JOIN library_references r ON r.id = a.reference_id
             WHERE a.id = ? AND (${eligible}) LIMIT 1`,
            after,
          )
          .toArray()[0]
      : undefined;
    if (after && !cursor) return null;
    return cursor
      ? this.ctx.storage.sql
          .exec<ArtifactRow>(
            `SELECT a.* FROM artifacts a
             LEFT JOIN library_references r ON r.id = a.reference_id
             WHERE (${eligible}) AND (a.created_at < ? OR (a.created_at = ? AND a.id > ?))
             ORDER BY a.created_at DESC, a.id LIMIT ?`,
            cursor.created_at,
            cursor.created_at,
            cursor.id,
            limit + 1,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<ArtifactRow>(
            `SELECT a.* FROM artifacts a
             LEFT JOIN library_references r ON r.id = a.reference_id
             WHERE ${eligible} ORDER BY a.created_at DESC, a.id LIMIT ?`,
            limit + 1,
          )
          .toArray();
  }

  async #reserveArtifactAnalysisQueuePublication(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    requestedAt: string,
    force: boolean,
  ): Promise<ArtifactAnalysisQueueReservation> {
    await this.#scheduleArtifactAnalysisPublicationAlarm(artifactAnalysisPublicationDelayMilliseconds);
    return this.ctx.storage.transactionSync(() => {
      const reservation = this.#artifactAnalyses.queue(artifactId, kind, requestedAt, force);
      if (reservation.shouldPublish) {
        const ownerKey = this.ctx.id.name;
        if (!ownerKey) throw new Error("Reference Library requires an owner-scoped Durable Object name");
        this.#artifactAnalyses.reservePublication(ownerKey, reservation.analysis);
      }
      return reservation;
    });
  }

  async #recoverArtifactAnalysisPublications(): Promise<void> {
    if (!this.#artifactAnalyses.hasPendingPublications()) return;
    const hasUnownedPublications = this.#artifactAnalyses.hasUnownedPublications();
    const migrationOwnerKey = hasUnownedPublications ? this.ctx.id.name : undefined;
    if (hasUnownedPublications && !migrationOwnerKey) throw new Error("Reference Library requires an owner-scoped Durable Object name");
    await this.#scheduleArtifactAnalysisPublicationAlarm(artifactAnalysisPublicationDelayMilliseconds);
    if (migrationOwnerKey) this.#artifactAnalyses.adoptUnownedPublications(migrationOwnerKey);
  }

  async #scheduleArtifactAnalysisPublicationAlarm(delayMilliseconds: number): Promise<void> {
    const scheduledAt = Date.now() + delayMilliseconds;
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm !== null && currentAlarm <= scheduledAt) return;
    await this.ctx.storage.setAlarm(scheduledAt);
  }

  #tags(referenceIds: ReadonlySet<string>): Record<string, string[]> {
    const tags: Record<string, string[]> = {};
    for (const row of this.ctx.storage.sql
      .exec<TagRow>("SELECT reference_id, tag FROM reference_tags ORDER BY tag COLLATE NOCASE")
      .toArray()) {
      if (!referenceIds.has(row.reference_id)) continue;
      (tags[row.reference_id] ??= []).push(row.tag);
    }
    return tags;
  }

  #collections(referenceIds: ReadonlySet<string>): Record<string, string[]> {
    const collections: Record<string, string[]> = {};
    for (const row of this.ctx.storage.sql.exec<CollectionRow>(
      "SELECT reference_id, collection_name FROM reference_collections ORDER BY collection_name COLLATE NOCASE",
    )) {
      if (!referenceIds.has(row.reference_id)) continue;
      (collections[row.reference_id] ??= []).push(row.collection_name);
    }
    return collections;
  }

  #count(table: "artifacts" | "notes" | "highlights" | "pdf_markups", referenceId: string): number {
    return this.ctx.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE reference_id = ?`, referenceId).one()
      .count;
  }

  #referenceMergeBlockers(referenceId: string): string[] {
    const blockers: string[] = [];
    const projectCount = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_dependencies WHERE reference_id = ?", referenceId)
      .one().count;
    const webSourceCount = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM web_sources WHERE reference_id = ?", referenceId)
      .one().count;
    const shareCount = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM research_shares WHERE reference_id = ?", referenceId)
      .one().count;
    if (projectCount) blockers.push(`${projectCount} linked project${projectCount === 1 ? "" : "s"}`);
    if (webSourceCount) blockers.push("captured web history");
    if (shareCount) blockers.push(`${shareCount} research share${shareCount === 1 ? "" : "s"}`);
    return blockers;
  }

  #reparentCitationAssertion(row: CitationAssertionRow, canonicalId: string, duplicateId: string): void {
    const citingReferenceId = row.citing_reference_id === duplicateId ? canonicalId : row.citing_reference_id;
    const citedReferenceId = row.cited_reference_id === duplicateId ? canonicalId : row.cited_reference_id;
    const existing = this.ctx.storage.sql
      .exec<CitationAssertionRow>(
        `SELECT * FROM citation_assertions WHERE id <> ? AND citing_reference_id = ? AND cited_reference_id = ? AND polarity = ?
         AND extraction_method = ? AND source_kind = ? AND source_id = ? LIMIT 1`,
        row.id,
        citingReferenceId,
        citedReferenceId,
        row.polarity,
        row.extraction_method,
        row.source_kind,
        row.source_id,
      )
      .toArray()[0];
    if (existing) {
      this.ctx.storage.sql.exec("UPDATE pdf_reference_reviews SET assertion_id = ? WHERE assertion_id = ?", existing.id, row.id);
      this.ctx.storage.sql.exec("DELETE FROM citation_assertions WHERE id = ?", row.id);
      return;
    }
    this.ctx.storage.sql.exec(
      "UPDATE citation_assertions SET citing_reference_id = ?, cited_reference_id = ? WHERE id = ?",
      citingReferenceId,
      citedReferenceId,
      row.id,
    );
  }

  #sharedContent(referenceId: string, kind: ResearchShareKind, resourceId: string): ResearchShareSnapshot["content"] {
    if (kind === "artifact") {
      const artifact = this.#artifact(resourceId);
      if (artifact.referenceId !== referenceId) throw new Error("Artifact does not belong to this reference");
      if (artifact.rights !== "shareable") throw new Error("Confirm that artifact rights allow project sharing first");
      return {
        kind,
        name: artifact.name,
        size: artifact.size,
        fingerprint: artifact.fingerprint,
        objectKey: artifact.objectKey,
      };
    }
    if (kind === "note") {
      const row = this.ctx.storage.sql
        .exec<NoteRow>("SELECT * FROM notes WHERE id = ? AND reference_id = ?", resourceId, referenceId)
        .toArray()[0];
      if (!row) throw new Error("Private note not found");
      return { kind, body: row.body };
    }
    if (kind === "web-snapshot") {
      const snapshot = this.getWebSnapshot(resourceId);
      if (snapshot.referenceId !== referenceId) throw new Error("Web snapshot does not belong to this reference");
      return {
        kind,
        snapshotId: snapshot.id,
        accessedAt: snapshot.accessedAt,
        finalUrl: snapshot.finalUrl,
        contentHash: snapshot.contentHash,
        rawObjectKey: snapshot.rawObjectKey,
        readableObjectKey: snapshot.readableObjectKey,
        complete: snapshot.complete,
        diagnostics: [...snapshot.diagnostics],
      };
    }
    const row = this.ctx.storage.sql
      .exec<HighlightRow>("SELECT * FROM highlights WHERE id = ? AND reference_id = ?", resourceId, referenceId)
      .toArray()[0];
    if (!row) throw new Error("Private highlight not found");
    return { kind, page: row.page, quote: row.quote, comment: row.comment };
  }
}

function mergeBibliographicRecords(
  canonical: BibliographicRecord,
  duplicate: BibliographicRecord,
  capturedAt: string,
  actor: string,
): BibliographicRecord {
  const copied = new Set<string>();
  const value = <T>(field: string, primary: T, secondary: T, missing: (candidate: T) => boolean): T => {
    if (!missing(primary)) return primary;
    copied.add(field);
    return secondary;
  };
  const type = value("type", canonical.type, duplicate.type, (candidate) => !candidate || candidate === "misc");
  const title = value("title", canonical.title, duplicate.title, (candidate) => !candidate.trim());
  const authors = value("authors", canonical.authors, duplicate.authors, (candidate) => candidate.length === 0);
  const year = value("year", canonical.year, duplicate.year, (candidate) => !candidate.trim());
  const venue = value("venue", canonical.venue, duplicate.venue, (candidate) => !candidate.trim());
  const doi = value("doi", canonical.doi, duplicate.doi, (candidate) => !candidate.trim());
  const url = value("url", canonical.url, duplicate.url, (candidate) => !candidate.trim());
  const abstract = value("abstract", canonical.abstract, duplicate.abstract, (candidate) => !candidate.trim());
  const provenance = { ...duplicate.provenance, ...canonical.provenance };
  for (const field of copied) {
    const key = field as keyof typeof provenance;
    provenance[key] = duplicate.provenance[key] ?? { method: "migration", capturedAt, actor };
  }
  return { ...canonical, type, title, authors, year, venue, doi, url, abstract, provenance, updatedAt: capturedAt };
}

function referenceFromRow(row: ReferenceRow): BibliographicRecord {
  return {
    id: row.id,
    referenceKey: row.reference_key ?? "",
    type: row.entry_type,
    title: row.title,
    authors: parseStringArray(row.authors_json),
    year: row.publication_year,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    abstract: row.abstract,
    provenance: parseProvenance(row.provenance_json),
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function referenceKeyStateFromRow(row: ReferenceRow): ReferenceKeyState {
  return row.reference_key_state === "provisional" ? "provisional" : "final";
}

function artifactFromRow(row: ArtifactRow): LibraryPdfArtifact {
  if (row.content_type !== "application/pdf") throw new Error("Stored library artifact has an invalid content type");
  return {
    id: row.id,
    referenceId: row.reference_id,
    name: row.name,
    contentType: "application/pdf",
    size: row.size,
    objectKey: row.object_key,
    fingerprint: row.fingerprint,
    rights: row.rights === "shareable" || row.rights === "unknown" ? row.rights : "private",
    createdAt: row.created_at,
  };
}

function webSourceFromRow(row: WebSourceRow): WebSource {
  return { referenceId: row.reference_id, canonicalUrl: row.canonical_url, createdAt: row.created_at, updatedAt: row.updated_at };
}

function webSnapshotFromRow(row: WebSnapshotRow): WebSnapshot {
  return {
    id: row.id,
    referenceId: row.reference_id,
    requestedUrl: row.requested_url,
    finalUrl: row.final_url,
    accessedAt: row.accessed_at,
    status: row.http_status,
    contentType: row.content_type,
    rawObjectKey: row.raw_object_key,
    readableObjectKey: row.readable_object_key,
    rawSize: row.raw_size,
    readableSize: row.readable_size,
    contentHash: row.content_hash,
    title: row.title,
    authors: parseStringArray(row.authors_json),
    publisher: row.publisher,
    publishedAt: row.published_at,
    complete: row.complete === 1,
    diagnostics: parseStringArray(row.diagnostics_json),
    redirectChain: parseStringArray(row.redirect_chain_json),
    etag: row.etag,
    lastModified: row.last_modified,
  };
}

function noteFromRow(row: NoteRow): LibraryNote {
  return { id: row.id, referenceId: row.reference_id, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

function highlightFromRow(row: HighlightRow): LibraryHighlight {
  return {
    id: row.id,
    referenceId: row.reference_id,
    artifactId: row.artifact_id,
    page: row.page,
    quote: row.quote,
    comment: row.comment,
    rects: parsePdfRectsJson(row.rects_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePdfRectsJson(value: string): LibraryHighlight["rects"] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Stored private highlight geometry is invalid");
  }
  const rects = parsePdfRects(parsed);
  if (!rects) throw new Error("Stored private highlight geometry is invalid");
  return rects;
}

function parsePdfRects(value: unknown): LibraryHighlight["rects"] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const rects = value.filter(
    (item): item is { x: number; y: number; width: number; height: number } =>
      typeof item === "object" &&
      item !== null &&
      "x" in item &&
      "y" in item &&
      "width" in item &&
      "height" in item &&
      normalizedCoordinate(item.x) &&
      normalizedCoordinate(item.y) &&
      typeof item.width === "number" &&
      typeof item.height === "number" &&
      item.width > 0 &&
      item.height > 0 &&
      item.x + item.width <= 1.000_001 &&
      item.y + item.height <= 1.000_001,
  );
  return rects.length === value.length ? rects : null;
}

function mergeHighlightComments(existingValue: string, incomingValue: string): string {
  const existing = existingValue.trim();
  const incoming = incomingValue.trim();
  if (!incoming || existing === incoming) return existing;
  if (!existing) return incoming;
  return `${existing}\n\n${incoming}`;
}

function pdfMarkupFromRow(row: PdfMarkupRow): LibraryPdfMarkup {
  if (row.kind === "note" && row.x !== null && row.y !== null) {
    return {
      id: row.id,
      referenceId: row.reference_id,
      artifactId: row.artifact_id,
      page: row.page,
      kind: "note",
      x: row.x,
      y: row.y,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  const points = parsePdfPoints(row.points_json);
  if (row.kind !== "drawing" || row.width === null || !points) {
    throw new Error("Stored private PDF annotation is invalid");
  }
  return {
    id: row.id,
    referenceId: row.reference_id,
    artifactId: row.artifact_id,
    page: row.page,
    kind: "drawing",
    color: row.color,
    width: row.width,
    points,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePdfPoints(value: string): LibraryPdfPoint[] | null {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 2_048) return null;
  const points: LibraryPdfPoint[] = [];
  for (const point of parsed) {
    if (!isUnknownRecord(point) || !normalizedCoordinate(point.x) || !normalizedCoordinate(point.y)) return null;
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function samePdfPoints(left: readonly LibraryPdfPoint[], right: readonly LibraryPdfPoint[]): boolean {
  return left.length === right.length && left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y);
}

function validPdfDrawingMutation(artifactReferenceId: string | null, mutationId: string, mutation: PdfDrawingMutationInput): boolean {
  return (
    validPdfDrawingTarget(artifactReferenceId, mutationId, mutation) &&
    validPdfDrawingStyle(mutation.color, mutation.width) &&
    validPdfDrawingPoints(mutation.points)
  );
}

function validPdfDrawingTarget(
  artifactReferenceId: string | null,
  mutationId: string,
  mutation: Pick<PdfDrawingMutationInput, "page" | "referenceId">,
): boolean {
  return (
    artifactReferenceId === mutation.referenceId && uuidPattern.test(mutationId) && Number.isInteger(mutation.page) && mutation.page >= 1
  );
}

function validPdfDrawingStyle(color: string, width: number): boolean {
  return /^#[0-9a-f]{6}$/u.test(color) && Number.isFinite(width) && width >= 1 && width <= 24;
}

function validPdfDrawingPoints(points: readonly LibraryPdfPoint[]): boolean {
  return (
    points.length >= 2 && points.length <= 2_048 && points.every((point) => normalizedCoordinate(point.x) && normalizedCoordinate(point.y))
  );
}

function samePdfDrawingMutation(existing: LibraryPdfMarkup, mutation: PdfDrawingMutationInput): existing is LibraryPdfDrawing {
  return (
    existing.kind === "drawing" &&
    existing.referenceId === mutation.referenceId &&
    existing.artifactId === mutation.artifactId &&
    existing.page === mutation.page &&
    existing.color === mutation.color &&
    existing.width === mutation.width &&
    samePdfPoints(existing.points, mutation.points)
  );
}

function normalizedCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readingFromRow(row: ReadingRow): ReadingState {
  return {
    referenceId: row.reference_id,
    status: row.status === "reading" || row.status === "read" ? row.status : "unread",
    rating: row.rating,
    priority: row.priority === "low" || row.priority === "high" ? row.priority : "normal",
    updatedAt: row.updated_at,
  };
}

function shareFromRow(row: ShareRow): ResearchShareSnapshot {
  const content = parseSharedContent(row.kind, row.snapshot_json);
  if (row.kind !== "artifact" && row.kind !== "note" && row.kind !== "highlight" && row.kind !== "web-snapshot") {
    throw new Error("Stored research share is invalid");
  }
  return {
    id: row.id,
    projectId: row.project_id,
    referenceId: row.reference_id,
    resourceId: row.resource_id,
    kind: row.kind,
    content,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

function pdfReferenceSourceLocator(
  result: { readonly mentions?: readonly { readonly candidateId: string; readonly page: number }[] },
  candidateId: string,
  bibliographyPage: number,
): string {
  const pages = [...new Set((result.mentions ?? []).filter((mention) => mention.candidateId === candidateId).map(({ page }) => page))].sort(
    (left, right) => left - right,
  );
  const evidence = pages.length > 0 ? `PDF mention page${pages.length === 1 ? "" : "s"} ${pages.join(", ")} · ` : "";
  return `${evidence}bibliography page ${bibliographyPage} · reference ${candidateId}`.slice(0, 2_000);
}

function citationAssertionFromRow(row: CitationAssertionRow): CitationAssertion {
  if (
    (row.polarity !== "cites" && row.polarity !== "does-not-cite") ||
    (row.evidence_state !== "confirmed" && row.evidence_state !== "extracted" && row.evidence_state !== "inferred") ||
    !isCitationMethod(row.extraction_method) ||
    !isCitationSourceKind(row.source_kind)
  ) {
    throw new Error("Stored citation assertion is invalid");
  }
  let review: CitationAssertionReview | null = null;
  if (row.review_decision !== null) {
    if (
      (row.review_decision !== "confirmed" && row.review_decision !== "rejected") ||
      row.reviewed_by === null ||
      row.reviewed_at === null ||
      row.review_note === null
    ) {
      throw new Error("Stored citation assertion review is invalid");
    }
    review = {
      decision: row.review_decision,
      reviewer: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      note: row.review_note,
    };
  }
  return {
    id: row.id,
    citingReferenceId: row.citing_reference_id,
    citedReferenceId: row.cited_reference_id,
    polarity: row.polarity,
    evidenceState: row.evidence_state,
    method: row.extraction_method,
    assertedBy: row.asserted_by,
    observedAt: row.observed_at,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceLocator: row.source_locator,
    confidence: row.confidence,
    review,
    createdAt: row.created_at,
  };
}

function citationResearchQueueItemFromRow(row: CitationResearchQueueRow): CitationResearchQueueItem {
  return {
    referenceId: row.reference_id,
    seedReferenceId: row.seed_reference_id,
    direction: row.direction === "citations" ? "citations" : "references",
    addedAt: row.added_at,
  };
}

function pdfReferenceReviewFromRow(row: PdfReferenceReviewRow): PdfReferenceCandidateReview {
  if (
    (row.decision !== "accepted" && row.decision !== "rejected") ||
    (row.decision === "accepted" && (!row.reference_id || !row.assertion_id)) ||
    (row.decision === "rejected" && (row.reference_id !== null || row.assertion_id !== null))
  ) {
    throw new Error("Stored PDF reference review is invalid");
  }
  return {
    candidateId: row.candidate_id,
    decision: row.decision,
    referenceId: row.reference_id,
    assertionId: row.assertion_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
}

function isCitationMethod(value: string): value is CitationAssertion["method"] {
  return (
    value === "authoritative-metadata" || value === "source-extraction" || value === "provider" || value === "model" || value === "manual"
  );
}

function isCitationSourceKind(value: string): value is CitationAssertion["sourceKind"] {
  return value === "pdf-artifact" || value === "web-snapshot" || value === "provider-response" || value === "researcher";
}

function parseSharedContent(kind: string, value: string): ResearchShareSnapshot["content"] {
  const parsed: unknown = JSON.parse(value);
  if (!isUnknownRecord(parsed) || parsed.kind !== kind) throw new Error("Stored research share snapshot is invalid");
  if (
    kind === "artifact" &&
    typeof parsed.name === "string" &&
    typeof parsed.size === "number" &&
    typeof parsed.fingerprint === "string" &&
    typeof parsed.objectKey === "string"
  ) {
    return { kind, name: parsed.name, size: parsed.size, fingerprint: parsed.fingerprint, objectKey: parsed.objectKey };
  }
  if (kind === "note" && typeof parsed.body === "string") return { kind, body: parsed.body };
  if (kind === "highlight" && typeof parsed.page === "number" && typeof parsed.quote === "string" && typeof parsed.comment === "string") {
    return { kind, page: parsed.page, quote: parsed.quote, comment: parsed.comment };
  }
  if (
    kind === "web-snapshot" &&
    typeof parsed.snapshotId === "string" &&
    typeof parsed.accessedAt === "string" &&
    typeof parsed.finalUrl === "string" &&
    typeof parsed.contentHash === "string" &&
    (parsed.rawObjectKey === null || typeof parsed.rawObjectKey === "string") &&
    (parsed.readableObjectKey === null || typeof parsed.readableObjectKey === "string") &&
    typeof parsed.complete === "boolean" &&
    Array.isArray(parsed.diagnostics) &&
    parsed.diagnostics.every((diagnostic) => typeof diagnostic === "string")
  ) {
    return {
      kind,
      snapshotId: parsed.snapshotId,
      accessedAt: parsed.accessedAt,
      finalUrl: parsed.finalUrl,
      contentHash: parsed.contentHash,
      rawObjectKey: parsed.rawObjectKey,
      readableObjectKey: parsed.readableObjectKey,
      complete: parsed.complete,
      diagnostics: parsed.diagnostics,
    };
  }
  throw new Error("Stored research share snapshot is invalid");
}

function publicationYear(value: string): string {
  return /^(\d{4})/u.exec(value.trim())?.[1] ?? "";
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseProvenance(value: string): BibliographicRecord["provenance"] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isUnknownRecord(parsed)) return {};
    const result: Partial<Record<keyof BibliographicRecord["provenance"], MetadataFieldProvenance>> = {};
    for (const field of ["type", "title", "authors", "year", "venue", "doi", "url", "abstract"] as const) {
      if (!(field in parsed)) continue;
      const item = parsed[field];
      if (
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item) &&
        "method" in item &&
        "capturedAt" in item &&
        "actor" in item &&
        (item.method === "bibtex" ||
          item.method === "crossref" ||
          item.method === "datacite" ||
          item.method === "openalex" ||
          item.method === "semantic-scholar" ||
          item.method === "filename" ||
          item.method === "manual" ||
          item.method === "pdf-metadata" ||
          item.method === "pdf-reference" ||
          item.method === "web" ||
          item.method === "migration") &&
        typeof item.capturedAt === "string" &&
        typeof item.actor === "string"
      ) {
        result[field] = { method: item.method, capturedAt: item.capturedAt, actor: item.actor };
      }
    }
    return result;
  } catch {
    return {};
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
