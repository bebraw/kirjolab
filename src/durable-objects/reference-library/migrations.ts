import type { SQLiteMigration } from "../migrations";

export const referenceLibraryMigrations = [
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
  {
    version: 8,
    name: "annotate-private-pdfs",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE pdf_markups (
          id TEXT PRIMARY KEY,
          reference_id TEXT NOT NULL REFERENCES library_references(id),
          artifact_id TEXT NOT NULL REFERENCES artifacts(id),
          page INTEGER NOT NULL CHECK (page > 0),
          kind TEXT NOT NULL CHECK (kind IN ('note', 'drawing')),
          x REAL,
          y REAL,
          body TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '',
          width REAL,
          points_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (
            (kind = 'note' AND x BETWEEN 0 AND 1 AND y BETWEEN 0 AND 1 AND body <> '') OR
            (kind = 'drawing' AND width BETWEEN 1 AND 24 AND color <> '' AND points_json <> '[]')
          )
        );
        CREATE INDEX pdf_markups_artifact ON pdf_markups(artifact_id, page, created_at, id);
        CREATE INDEX pdf_markups_reference ON pdf_markups(reference_id);
      `);
      return undefined;
    },
  },
  {
    version: 9,
    name: "preserve-private-highlight-geometry",
    apply(sql): undefined {
      sql.exec("ALTER TABLE highlights ADD COLUMN rects_json TEXT NOT NULL DEFAULT '[]'");
      return undefined;
    },
  },
  {
    version: 10,
    name: "refine-linked-pdf-reference-keys",
    apply(sql): undefined {
      sql.exec(`
        UPDATE library_references
        SET reference_key_state = 'provisional'
        WHERE reference_key_state = 'final'
          AND reference_key LIKE 'sourceundated%' COLLATE NOCASE
          AND EXISTS (
            SELECT 1 FROM artifacts WHERE artifacts.reference_id = library_references.id
          );
      `);
      return undefined;
    },
  },
  {
    version: 11,
    name: "queue-artifact-analysis",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE artifact_analyses (
          artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
          fingerprint TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('pdf-highlights')),
          status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
          result_json TEXT NOT NULL DEFAULT '',
          error TEXT NOT NULL DEFAULT '',
          requested_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          PRIMARY KEY (artifact_id, kind)
        );
      `);
      return undefined;
    },
  },
  {
    version: 12,
    name: "analyze-pdf-references",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE artifact_analyses RENAME TO artifact_analyses_v11;
        CREATE TABLE artifact_analyses (
          artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
          fingerprint TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('pdf-highlights', 'pdf-references')),
          status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
          result_json TEXT NOT NULL DEFAULT '',
          error TEXT NOT NULL DEFAULT '',
          requested_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          PRIMARY KEY (artifact_id, kind)
        );
        INSERT INTO artifact_analyses
          (artifact_id, fingerprint, kind, status, result_json, error, requested_at, started_at, completed_at)
        SELECT artifact_id, fingerprint, kind, status, result_json, error, requested_at, started_at, completed_at
        FROM artifact_analyses_v11;
        DROP TABLE artifact_analyses_v11;
      `);
      return undefined;
    },
  },
  {
    version: 13,
    name: "review-pdf-reference-candidates",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE pdf_reference_reviews (
          artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
          fingerprint TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
          reference_id TEXT REFERENCES library_references(id),
          assertion_id TEXT REFERENCES citation_assertions(id),
          reviewed_by TEXT NOT NULL,
          reviewed_at TEXT NOT NULL,
          PRIMARY KEY (artifact_id, candidate_id),
          CHECK (
            (decision = 'accepted' AND reference_id IS NOT NULL AND assertion_id IS NOT NULL) OR
            (decision = 'rejected' AND reference_id IS NULL AND assertion_id IS NULL)
          )
        );
      `);
      return undefined;
    },
  },
  {
    version: 14,
    name: "queue-citation-trail-research",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE citation_research_queue (
          reference_id TEXT PRIMARY KEY REFERENCES library_references(id) ON DELETE CASCADE,
          seed_reference_id TEXT NOT NULL REFERENCES library_references(id) ON DELETE CASCADE,
          direction TEXT NOT NULL CHECK (direction IN ('references', 'citations')),
          added_at TEXT NOT NULL,
          CHECK (reference_id <> seed_reference_id)
        );
        CREATE INDEX citation_research_queue_added ON citation_research_queue(added_at, reference_id);
      `);
      return undefined;
    },
  },
  {
    version: 15,
    name: "extract-searchable-pdf-text",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE artifact_analyses RENAME TO artifact_analyses_v14;
        CREATE TABLE artifact_analyses (
          artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
          fingerprint TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('pdf-highlights', 'pdf-references', 'pdf-text')),
          status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
          result_json TEXT NOT NULL DEFAULT '',
          error TEXT NOT NULL DEFAULT '',
          requested_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          PRIMARY KEY (artifact_id, kind)
        );
        INSERT INTO artifact_analyses
          (artifact_id, fingerprint, kind, status, result_json, error, requested_at, started_at, completed_at)
        SELECT artifact_id, fingerprint, kind, status, result_json, error, requested_at, started_at, completed_at
        FROM artifact_analyses_v14;
        DROP TABLE artifact_analyses_v14;
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];
