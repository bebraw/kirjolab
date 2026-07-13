import { DurableObject } from "cloudflare:workers";
import { normalizeDoi, parseBibTeX } from "../domain/bibliography";
import {
  buildCitationNetwork,
  type CitationAssertion,
  type CitationAssertionReview,
  type CitationNetwork,
  type CreateCitationAssertionInput,
  type ReviewCitationAssertionInput,
} from "../domain/citation-assertions";
import {
  likelyReferenceIdentity,
  crossrefMetadataFields,
  isCrossrefMetadata,
  memorableReferenceKey,
  missingRequiredBibliographicFields,
  referenceFromBibTeX,
  type BibliographicRecord,
  type CrossrefMetadata,
  type CrossrefMetadataField,
  type LibraryHighlight,
  type LibraryNote,
  type LibraryPdfArtifact,
  type MetadataFieldProvenance,
  type ReadingState,
  type ReviewedPdfMetadata,
  type ReferenceLibrarySnapshot,
  type ReferenceKeyState,
  type ResearchShareKind,
  type ResearchShareSnapshot,
  type ScholarlyMetadataProvider,
  type WebCaptureRegistration,
  type WebSnapshot,
  type WebSource,
} from "../domain/reference-library";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

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
  created_at: string;
  updated_at: string;
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
  readonly webSnapshotCount: number;
}

export interface WebCaptureItem {
  readonly reference: BibliographicRecord;
  readonly source: WebSource;
  readonly snapshot: WebSnapshot;
  readonly created: boolean;
}

export interface PdfDraftItem {
  readonly reference: BibliographicRecord;
  readonly artifact: LibraryPdfArtifact;
}

const migrations = [
  {
    version: 1,
    name: "create-private-reference-library",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE library_references (
          id TEXT PRIMARY KEY,
          identity_key TEXT NOT NULL UNIQUE,
          entry_type TEXT NOT NULL,
          title TEXT NOT NULL,
          authors_json TEXT NOT NULL,
          publication_year TEXT NOT NULL,
          venue TEXT NOT NULL,
          doi TEXT NOT NULL,
          url TEXT NOT NULL,
          abstract TEXT NOT NULL,
          provenance_json TEXT NOT NULL,
          archived_at TEXT,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE artifacts (
          id TEXT PRIMARY KEY,
          reference_id TEXT REFERENCES library_references(id),
          name TEXT NOT NULL,
          content_type TEXT NOT NULL CHECK (content_type = 'application/pdf'),
          size INTEGER NOT NULL CHECK (size > 0),
          object_key TEXT NOT NULL UNIQUE,
          fingerprint TEXT NOT NULL,
          rights TEXT NOT NULL CHECK (rights IN ('private', 'shareable', 'unknown')),
          created_at TEXT NOT NULL
        );
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE highlights (
          id TEXT PRIMARY KEY,
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          artifact_id TEXT NOT NULL REFERENCES artifacts(id),
          page INTEGER NOT NULL CHECK (page > 0),
          quote TEXT NOT NULL,
          comment TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE reference_tags (
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          tag TEXT NOT NULL COLLATE NOCASE,
          PRIMARY KEY (reference_id, tag)
        );
        CREATE TABLE reading_state (
          reference_id TEXT PRIMARY KEY REFERENCES library_references(id),
          status TEXT NOT NULL CHECK (status IN ('unread', 'reading', 'read')),
          rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE project_dependencies (
          project_id TEXT NOT NULL,
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          linked_at TEXT NOT NULL,
          PRIMARY KEY (project_id, reference_id)
        );
        CREATE INDEX references_doi ON library_references(doi) WHERE doi <> '';
        CREATE INDEX artifacts_reference ON artifacts(reference_id);
        CREATE INDEX project_dependencies_reference ON project_dependencies(reference_id);
      `);
      return undefined;
    },
  },
  {
    version: 2,
    name: "share-private-research-explicitly",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE research_shares (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          resource_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('artifact', 'note', 'highlight')),
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT,
          UNIQUE (project_id, kind, resource_id)
        );
        CREATE INDEX research_shares_reference ON research_shares(reference_id);
      `);
      return undefined;
    },
  },
  {
    version: 3,
    name: "capture-versioned-web-sources",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE web_sources (
          reference_id TEXT PRIMARY KEY REFERENCES library_references(id),
          canonical_url TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE web_snapshots (
          id TEXT PRIMARY KEY,
          reference_id TEXT NOT NULL REFERENCES web_sources(reference_id),
          requested_url TEXT NOT NULL,
          final_url TEXT NOT NULL,
          accessed_at TEXT NOT NULL,
          http_status INTEGER NOT NULL CHECK (http_status BETWEEN 0 AND 599),
          content_type TEXT NOT NULL,
          raw_object_key TEXT UNIQUE,
          readable_object_key TEXT UNIQUE,
          raw_size INTEGER NOT NULL CHECK (raw_size >= 0),
          readable_size INTEGER NOT NULL CHECK (readable_size >= 0),
          content_hash TEXT NOT NULL,
          title TEXT NOT NULL,
          authors_json TEXT NOT NULL,
          publisher TEXT NOT NULL,
          published_at TEXT NOT NULL,
          complete INTEGER NOT NULL CHECK (complete IN (0, 1)),
          diagnostics_json TEXT NOT NULL,
          redirect_chain_json TEXT NOT NULL,
          etag TEXT NOT NULL,
          last_modified TEXT NOT NULL
        );
        CREATE INDEX web_snapshots_reference ON web_snapshots(reference_id, accessed_at DESC, id);

        DROP INDEX research_shares_reference;
        ALTER TABLE research_shares RENAME TO research_shares_v2;
        CREATE TABLE research_shares (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          resource_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('artifact', 'note', 'highlight', 'web-snapshot')),
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT,
          UNIQUE (project_id, kind, resource_id)
        );
        INSERT INTO research_shares SELECT * FROM research_shares_v2;
        DROP TABLE research_shares_v2;
        CREATE INDEX research_shares_reference ON research_shares(reference_id);
      `);
      return undefined;
    },
  },
  {
    version: 4,
    name: "model-citation-assertions-with-provenance",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE citation_assertions (
          id TEXT PRIMARY KEY,
          citing_reference_id TEXT NOT NULL REFERENCES library_references(id),
          cited_reference_id TEXT NOT NULL REFERENCES library_references(id),
          polarity TEXT NOT NULL CHECK (polarity IN ('cites', 'does-not-cite')),
          evidence_state TEXT NOT NULL CHECK (evidence_state IN ('confirmed', 'extracted', 'inferred')),
          extraction_method TEXT NOT NULL CHECK (
            extraction_method IN ('authoritative-metadata', 'source-extraction', 'provider', 'model', 'manual')
          ),
          asserted_by TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          source_kind TEXT NOT NULL CHECK (source_kind IN ('pdf-artifact', 'web-snapshot', 'provider-response', 'researcher')),
          source_id TEXT NOT NULL,
          source_locator TEXT NOT NULL,
          confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
          review_decision TEXT CHECK (review_decision IS NULL OR review_decision IN ('confirmed', 'rejected')),
          reviewed_by TEXT,
          reviewed_at TEXT,
          review_note TEXT,
          created_at TEXT NOT NULL,
          CHECK (citing_reference_id <> cited_reference_id),
          UNIQUE (citing_reference_id, cited_reference_id, polarity, extraction_method, source_kind, source_id)
        );
        CREATE INDEX citation_assertions_citing ON citation_assertions(citing_reference_id, created_at, id);
        CREATE INDEX citation_assertions_cited ON citation_assertions(cited_reference_id, created_at, id);
      `);
      return undefined;
    },
  },
  {
    version: 5,
    name: "organize-reference-library",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE reading_state ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
          CHECK (priority IN ('low', 'normal', 'high'));
        CREATE TABLE reference_collections (
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          collection_name TEXT NOT NULL COLLATE NOCASE,
          PRIMARY KEY (reference_id, collection_name)
        );
      `);
      return undefined;
    },
  },
  {
    version: 6,
    name: "add-immutable-reference-keys",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE library_references ADD COLUMN reference_key TEXT;
        CREATE UNIQUE INDEX references_reference_key ON library_references(reference_key COLLATE NOCASE)
          WHERE reference_key IS NOT NULL;
      `);
      return undefined;
    },
  },
  {
    version: 7,
    name: "finalize-provisional-reference-keys",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE library_references ADD COLUMN reference_key_state TEXT NOT NULL DEFAULT 'final'
          CHECK (reference_key_state IN ('provisional', 'final'));
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

export class ReferenceLibrary extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("PRAGMA foreign_keys = ON");
      runSQLiteMigrations(this.ctx.storage, migrations);
      this.#backfillReferenceKeys();
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
      tags: this.#tags(referenceIds),
      collections: this.#collections(referenceIds),
      reading: this.ctx.storage.sql
        .exec<ReadingRow>("SELECT * FROM reading_state ORDER BY updated_at DESC")
        .toArray()
        .filter((row) => referenceIds.has(row.reference_id))
        .map(readingFromRow),
    };
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
        ...(existingReference?.provenance ?? {}),
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

  createPdfDraft(artifact: LibraryPdfArtifact, actor: string): PdfDraftItem {
    if (artifact.referenceId !== null) throw new Error("A new PDF draft must not already identify a reference");
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
      this.#writeReference(reference, `pdf:${artifact.fingerprint}`, true, "provisional");
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
    return { reference, artifact: identified };
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

  createHighlight(referenceId: string, artifactId: string, page: number, quoteValue: string, commentValue: string): LibraryHighlight {
    this.#reference(referenceId);
    const artifact = this.#artifact(artifactId);
    if (artifact.referenceId !== referenceId) throw new Error("PDF is not identified as this reference");
    const quote = quoteValue.trim();
    const comment = commentValue.trim();
    if (!Number.isInteger(page) || page < 1 || !quote || quote.length > 20_000 || comment.length > 8_000) {
      throw new Error("Invalid private highlight");
    }
    const now = new Date().toISOString();
    const highlight: LibraryHighlight = {
      id: crypto.randomUUID(),
      referenceId,
      artifactId,
      page,
      quote,
      comment,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO highlights (id, reference_id, artifact_id, page, quote, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      highlight.id,
      referenceId,
      artifactId,
      page,
      quote,
      comment,
      now,
      now,
    );
    return highlight;
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
    return this.#reference(referenceId);
  }

  getPdfMetadataContext(referenceId: string, artifactId: string): { reference: BibliographicRecord; artifact: LibraryPdfArtifact } {
    const reference = this.#reference(referenceId);
    const row = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE id = ?", artifactId).toArray()[0];
    if (!row || row.reference_id !== referenceId) throw new Error("PDF artifact does not belong to this reference");
    return { reference, artifact: artifactFromRow(row) };
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
    const current = this.#reference(referenceId);
    const providerDoi = normalizeDoi(metadata.doi);
    const currentDoi = normalizeDoi(current.doi);
    if ((provider !== "crossref" && provider !== "datacite") || !providerDoi || (currentDoi && currentDoi !== providerDoi)) {
      throw new Error("Reference DOI changed; review provider metadata again");
    }
    if (
      fields.length === 0 ||
      fields.length > crossrefMetadataFields.length ||
      new Set(fields).size !== fields.length ||
      fields.some((field) => !crossrefMetadataFields.includes(field)) ||
      !isCrossrefMetadata(metadata)
    ) {
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
    for (const field of fields) {
      provenance[field] = { method: provider, capturedAt: updatedAt, actor };
    }
    const selected: Partial<CrossrefMetadata> = {
      ...(fields.includes("type") ? { type: metadata.type } : {}),
      ...(fields.includes("title") ? { title: metadata.title } : {}),
      ...(fields.includes("authors") ? { authors: metadata.authors } : {}),
      ...(fields.includes("year") ? { year: metadata.year } : {}),
      ...(fields.includes("venue") ? { venue: metadata.venue } : {}),
      ...(fields.includes("doi") ? { doi: providerDoi } : {}),
      ...(fields.includes("url") ? { url: metadata.url } : {}),
      ...(fields.includes("abstract") ? { abstract: metadata.abstract } : {}),
    };
    const next: BibliographicRecord = { ...current, ...selected, provenance, updatedAt };
    if (!next.title.trim() || !next.type.trim()) throw new Error("Reference type and title are required");
    this.#writeEnrichedReference(next);
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
      this.ctx.storage.sql.exec("UPDATE library_references SET reference_key_state = 'final' WHERE id = ?", referenceId);
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

  #count(table: "artifacts" | "notes" | "highlights", referenceId: string): number {
    return this.ctx.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE reference_id = ?`, referenceId).one()
      .count;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
          item.method === "filename" ||
          item.method === "manual" ||
          item.method === "pdf-metadata" ||
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
