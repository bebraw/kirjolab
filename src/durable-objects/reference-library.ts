import { DurableObject } from "cloudflare:workers";
import { parseBibTeX } from "../domain/bibliography";
import {
  likelyReferenceIdentity,
  missingRequiredBibliographicFields,
  referenceFromBibTeX,
  type BibliographicRecord,
  type LibraryHighlight,
  type LibraryNote,
  type LibraryPdfArtifact,
  type MetadataFieldProvenance,
  type ReadingState,
  type ReferenceLibrarySnapshot,
  type ResearchShareKind,
  type ResearchShareSnapshot,
  type WebCaptureRegistration,
  type WebSnapshot,
  type WebSource,
} from "../domain/reference-library";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

interface ReferenceRow extends Record<string, SqlStorageValue> {
  id: string;
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
  updated_at: string;
}

interface TagRow extends Record<string, SqlStorageValue> {
  reference_id: string;
  tag: string;
}

interface ProjectDependencyRow extends Record<string, SqlStorageValue> {
  project_id: string;
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
] as const satisfies readonly SQLiteMigration[];

export class ReferenceLibrary extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("PRAGMA foreign_keys = ON");
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  getSnapshot(includeArchived = false): ReferenceLibrarySnapshot {
    const where = includeArchived ? "deleted_at IS NULL" : "archived_at IS NULL AND deleted_at IS NULL";
    const references = this.ctx.storage.sql
      .exec<ReferenceRow>(`SELECT * FROM library_references WHERE ${where} ORDER BY title COLLATE NOCASE, id`)
      .toArray()
      .map(referenceFromRow);
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
          const updated = { ...candidate, id: existing.id, createdAt: existing.created_at };
          this.#writeReference(updated, identityKey, false);
          return { reference: updated, suggestedAlias: entry.citationKey, created: false };
        }
        this.#writeReference(candidate, identityKey, true);
        return { reference: candidate, suggestedAlias: entry.citationKey, created: true };
      }),
    );
  }

  getReferences(referenceIds: readonly string[]): BibliographicRecord[] {
    if (referenceIds.length > 512) throw new Error("Too many references requested");
    return referenceIds.map((id) => this.#reference(id, true));
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
    const existingReference = existingSource ? this.#reference(referenceId, true) : null;
    const snapshot: WebSnapshot = { ...registration.snapshot, referenceId };
    const provenance: MetadataFieldProvenance = { method: "web", capturedAt: now, actor: registration.actor };
    const reference: BibliographicRecord = {
      id: referenceId,
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
    const source: WebSource = {
      referenceId,
      canonicalUrl: registration.canonicalUrl,
      createdAt: existingSource?.created_at ?? now,
      updatedAt: now,
    };
    this.ctx.storage.transactionSync(() => {
      this.#writeReference(reference, `web:${registration.canonicalUrl}`, !existingSource);
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
    return { reference, source, snapshot, created: !existingSource };
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

  setReadingState(referenceId: string, status: ReadingState["status"], rating: number | null): ReadingState {
    this.#reference(referenceId);
    if (!(["unread", "reading", "read"] as const).includes(status)) throw new Error("Invalid reading state");
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Rating must be between 1 and 5");
    const updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO reading_state (reference_id, status, rating, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(reference_id) DO UPDATE SET status = excluded.status, rating = excluded.rating, updated_at = excluded.updated_at`,
      referenceId,
      status,
      rating,
      updatedAt,
    );
    return { referenceId, status, rating, updatedAt };
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
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO project_dependencies (project_id, reference_id, linked_at) VALUES (?, ?, ?)",
      projectId,
      referenceId,
      new Date().toISOString(),
    );
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

  #writeReference(reference: BibliographicRecord, identityKey: string, insert: boolean): void {
    const values = [
      reference.id,
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
    ] as const;
    if (insert) {
      this.ctx.storage.sql.exec(
        `INSERT INTO library_references
         (id, identity_key, entry_type, title, authors_json, publication_year, venue, doi, url, abstract,
          provenance_json, archived_at, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        ...values,
      );
      return;
    }
    this.ctx.storage.sql.exec(
      `UPDATE library_references SET identity_key = ?, entry_type = ?, title = ?, authors_json = ?, publication_year = ?, venue = ?,
       doi = ?, url = ?, abstract = ?, provenance_json = ?, archived_at = NULL, deleted_at = NULL, updated_at = ? WHERE id = ?`,
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

  #reference(referenceId: string, includeDeleted = false): BibliographicRecord {
    const row = this.ctx.storage.sql.exec<ReferenceRow>("SELECT * FROM library_references WHERE id = ?", referenceId).toArray()[0];
    if (!row || (!includeDeleted && row.deleted_at !== null)) throw new Error("Reference not found");
    return referenceFromRow(row);
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
          item.method === "manual" ||
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
