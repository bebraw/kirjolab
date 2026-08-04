import * as Y from "yjs";
import { isRecord as isRecordValue } from "../../domain/unknown-value";
import { projectEntryPath } from "../../domain/project/project-files";
import {
  defaultGuidePath,
  defaultGuideSource,
  defaultSource,
  defaultTransclusionPath,
  defaultTransclusionSource,
  legacyDefaultSource,
} from "../../domain/workspace/workspace";
import type { SQLiteMigration } from "../../persistence/sqlite/migrations";

interface DocumentRoomMigrationDependencies {
  readonly document: Y.Doc;
  readonly storage: DurableObjectStorage;
  readonly addAnchorColumns: (table: "passage_links" | "claim_passage_links") => void;
  readonly backfillManuscriptAnchors: () => void;
  readonly reconcileBibliography: (source: string) => void;
  readonly workspaceRow: () => { readonly entry_file_id: string | null; readonly source: string };
  readonly folderAncestors: (path: string) => string[];
}

interface MigrationProjectRevisionRow extends Record<string, SqlStorageValue> {
  readonly revision: number;
  readonly snapshot_json: string;
}

interface MigrationProjectFileRow extends Record<string, SqlStorageValue> {
  readonly id: string;
  readonly path: string;
  readonly content: string;
}

export function documentRoomSchemaMigrations(dependencies: DocumentRoomMigrationDependencies): readonly SQLiteMigration[] {
  return [
    {
      version: 1,
      name: "create-document-room",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS workspace (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              title TEXT NOT NULL,
              y_state BLOB NOT NULL,
              source TEXT NOT NULL,
              bibliography TEXT NOT NULL,
              revision INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pdfs (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              content_type TEXT NOT NULL,
              size INTEGER NOT NULL,
              object_key TEXT NOT NULL UNIQUE,
              fingerprint TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS annotations (
              id TEXT PRIMARY KEY,
              pdf_id TEXT NOT NULL REFERENCES pdfs(id),
              page INTEGER NOT NULL CHECK (page > 0),
              quote TEXT NOT NULL,
              prefix TEXT NOT NULL,
              suffix TEXT NOT NULL,
              comment TEXT NOT NULL,
              rects_json TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS passage_links (
              id TEXT PRIMARY KEY,
              annotation_id TEXT NOT NULL REFERENCES annotations(id),
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              excerpt TEXT NOT NULL,
              anchor_version INTEGER NOT NULL DEFAULT 0,
              relative_start BLOB,
              relative_end BLOB,
              quote_prefix TEXT NOT NULL DEFAULT '',
              quote_suffix TEXT NOT NULL DEFAULT '',
              anchored_revision INTEGER,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS candidates (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL,
              model TEXT NOT NULL,
              source_revision INTEGER NOT NULL,
              source_ids TEXT NOT NULL,
              proposed_source TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS publications (
              id TEXT PRIMARY KEY,
              citation_key TEXT NOT NULL UNIQUE COLLATE NOCASE,
              entry_type TEXT NOT NULL,
              title TEXT NOT NULL,
              authors_json TEXT NOT NULL,
              publication_year TEXT NOT NULL,
              venue TEXT NOT NULL,
              doi TEXT NOT NULL,
              url TEXT NOT NULL,
              abstract TEXT NOT NULL,
              metadata_source TEXT NOT NULL CHECK (metadata_source IN ('bibtex', 'crossref')),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS claims (
              id TEXT PRIMARY KEY,
              text TEXT NOT NULL,
              note TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS claim_evidence_links (
              id TEXT PRIMARY KEY,
              claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
              annotation_id TEXT NOT NULL REFERENCES annotations(id),
              relation TEXT NOT NULL CHECK (relation IN ('supports', 'contradicts', 'extends')),
              created_at TEXT NOT NULL,
              UNIQUE (claim_id, annotation_id)
            );
            CREATE TABLE IF NOT EXISTS claim_passage_links (
              id TEXT PRIMARY KEY,
              claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              excerpt TEXT NOT NULL,
              anchor_version INTEGER NOT NULL DEFAULT 0,
              relative_start BLOB,
              relative_end BLOB,
              quote_prefix TEXT NOT NULL DEFAULT '',
              quote_suffix TEXT NOT NULL DEFAULT '',
              anchored_revision INTEGER,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS publications_doi ON publications(doi) WHERE doi <> '';
            CREATE INDEX IF NOT EXISTS claim_evidence_annotation ON claim_evidence_links(annotation_id);
            CREATE INDEX IF NOT EXISTS claim_passage_claim ON claim_passage_links(claim_id);
          `);
        return undefined;
      },
    },
    {
      version: 2,
      name: "add-pdf-fingerprint",
      apply(sql): undefined {
        const columns = sql.exec<{ name: string }>("PRAGMA table_info(pdfs)").toArray();
        if (!columns.some((column) => column.name === "fingerprint")) {
          sql.exec("ALTER TABLE pdfs ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''");
        }
        return undefined;
      },
    },
    {
      version: 3,
      name: "add-annotation-rectangles",
      apply(sql): undefined {
        const columns = sql.exec<{ name: string }>("PRAGMA table_info(annotations)").toArray();
        if (!columns.some((column) => column.name === "rects_json")) {
          sql.exec("ALTER TABLE annotations ADD COLUMN rects_json TEXT NOT NULL DEFAULT '[]'");
        }
        return undefined;
      },
    },
    {
      version: 4,
      name: "add-relative-manuscript-anchors",
      apply: (): undefined => {
        dependencies.addAnchorColumns("passage_links");
        dependencies.addAnchorColumns("claim_passage_links");
        return undefined;
      },
    },
  ];
}

export function documentRoomDataMigrations(dependencies: DocumentRoomMigrationDependencies): readonly SQLiteMigration[] {
  return [
    {
      version: 5,
      name: "backfill-relative-manuscript-anchors",
      apply: (): undefined => {
        dependencies.backfillManuscriptAnchors();
        return undefined;
      },
    },
    {
      version: 6,
      name: "project-canonical-bibliography",
      apply: (): undefined => {
        dependencies.reconcileBibliography(dependencies.document.getText("bibliography").toString());
        return undefined;
      },
    },
    {
      version: 7,
      name: "add-publication-pdf-links",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS publication_pdf_links (
              id TEXT PRIMARY KEY,
              publication_id TEXT NOT NULL REFERENCES publications(id),
              pdf_id TEXT NOT NULL REFERENCES pdfs(id),
              created_at TEXT NOT NULL,
              UNIQUE (publication_id, pdf_id)
            );
            CREATE INDEX IF NOT EXISTS publication_pdf_links_pdf ON publication_pdf_links(pdf_id);
          `);
        return undefined;
      },
    },
    {
      version: 8,
      name: "replace-whole-document-candidates",
      apply(sql): undefined {
        sql.exec(`
            DROP TABLE IF EXISTS candidates;
            CREATE TABLE candidates (
              id TEXT PRIMARY KEY,
              operation TEXT NOT NULL CHECK (operation = 'revise-selection'),
              prompt_version TEXT NOT NULL CHECK (prompt_version = 'revise-selection-v1'),
              provider_adapter TEXT NOT NULL CHECK (provider_adapter = 'openai-compatible'),
              provider_label TEXT NOT NULL,
              model TEXT NOT NULL,
              instruction TEXT NOT NULL,
              source_revision INTEGER NOT NULL,
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              excerpt TEXT NOT NULL,
              anchor_version INTEGER NOT NULL CHECK (anchor_version = 1),
              relative_start BLOB NOT NULL,
              relative_end BLOB NOT NULL,
              quote_prefix TEXT NOT NULL,
              quote_suffix TEXT NOT NULL,
              anchored_revision INTEGER NOT NULL,
              evidence_json TEXT NOT NULL,
              proposed_replacement TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
              created_at TEXT NOT NULL
            );
          `);
        return undefined;
      },
    },
    {
      version: 9,
      name: "compose-project-from-main",
      apply: (): undefined => {
        const columns = dependencies.storage.sql.exec<{ name: string }>("PRAGMA table_info(workspace)").toArray();
        if (!columns.some((column) => column.name === "entry_file_id")) {
          dependencies.storage.sql.exec("ALTER TABLE workspace ADD COLUMN entry_file_id TEXT");
        }
        dependencies.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS project_files (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE,
              media_type TEXT NOT NULL CHECK (media_type = 'text/markdown'),
              y_text_name TEXT NOT NULL UNIQUE,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        const workspace = dependencies.workspaceRow();
        if (!workspace.entry_file_id) {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          dependencies.storage.sql.exec(
            `INSERT INTO project_files (id, path, media_type, y_text_name, content, created_at, updated_at)
               VALUES (?, ?, 'text/markdown', 'source', ?, ?, ?)`,
            id,
            projectEntryPath,
            workspace.source,
            now,
            now,
          );
          dependencies.storage.sql.exec("UPDATE workspace SET entry_file_id = ? WHERE id = 1", id);
          if (workspace.source === defaultSource) {
            const supportingId = crypto.randomUUID();
            const yTextName = `file:${supportingId}`;
            dependencies.document.getText(yTextName).insert(0, defaultTransclusionSource);
            dependencies.storage.sql.exec(
              `INSERT INTO project_files (id, path, media_type, y_text_name, content, created_at, updated_at)
                 VALUES (?, ?, 'text/markdown', ?, ?, ?, ?)`,
              supportingId,
              defaultTransclusionPath,
              yTextName,
              defaultTransclusionSource,
              now,
              now,
            );
            const state = Y.encodeStateAsUpdate(dependencies.document);
            dependencies.storage.sql.exec("UPDATE workspace SET y_state = ? WHERE id = 1", state.buffer);
          }
        }
        return undefined;
      },
    },
    {
      version: 10,
      name: "qualify-manuscript-anchors-by-file",
      apply: (): undefined => {
        const entryFileId = dependencies.workspaceRow().entry_file_id;
        if (!entryFileId) throw new Error("Project entry file is not initialized");
        for (const table of ["passage_links", "claim_passage_links", "candidates"] as const) {
          const columns = dependencies.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
          if (!columns.some((column) => column.name === "project_file_id")) {
            dependencies.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN project_file_id TEXT`);
          }
          dependencies.storage.sql.exec(`UPDATE ${table} SET project_file_id = ? WHERE project_file_id IS NULL`, entryFileId);
        }
        return undefined;
      },
    },
    {
      version: 11,
      name: "link-shared-library-references",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS project_references (
              id TEXT PRIMARY KEY,
              reference_id TEXT NOT NULL UNIQUE,
              citation_alias TEXT NOT NULL UNIQUE COLLATE NOCASE,
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        return undefined;
      },
    },
    {
      version: 12,
      name: "pin-explicit-private-research-shares",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS project_research_shares (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              reference_id TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              kind TEXT NOT NULL CHECK (kind IN ('artifact', 'note', 'highlight')),
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              revoked_at TEXT
            );
            CREATE INDEX IF NOT EXISTS project_research_shares_reference ON project_research_shares(reference_id);
          `);
        return undefined;
      },
    },
    {
      version: 13,
      name: "retain-legacy-project-pdf-links",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS project_reference_pdf_links (
              id TEXT PRIMARY KEY,
              publication_id TEXT NOT NULL,
              pdf_id TEXT NOT NULL REFERENCES pdfs(id),
              created_at TEXT NOT NULL,
              UNIQUE (publication_id, pdf_id)
            );
          `);
        return undefined;
      },
    },
    {
      version: 14,
      name: "pin-shared-web-snapshots",
      apply(sql): undefined {
        sql.exec(`
            DROP INDEX IF EXISTS project_research_shares_reference;
            ALTER TABLE project_research_shares RENAME TO project_research_shares_v13;
            CREATE TABLE project_research_shares (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              reference_id TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              kind TEXT NOT NULL CHECK (kind IN ('artifact', 'note', 'highlight', 'web-snapshot')),
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              revoked_at TEXT
            );
            INSERT INTO project_research_shares SELECT * FROM project_research_shares_v13;
            DROP TABLE project_research_shares_v13;
            CREATE INDEX project_research_shares_reference ON project_research_shares(reference_id);
          `);
        return undefined;
      },
    },
    {
      version: 15,
      name: "preserve-project-revisions-and-milestones",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS project_revisions (
              revision INTEGER PRIMARY KEY,
              reason TEXT NOT NULL,
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_milestones (
              id TEXT PRIMARY KEY,
              revision INTEGER NOT NULL REFERENCES project_revisions(revision),
              name TEXT NOT NULL UNIQUE COLLATE NOCASE,
              description TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS project_milestones_revision ON project_milestones(revision);
          `);
        return undefined;
      },
    },
    {
      version: 16,
      name: "anchor-collaborative-comments",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS manuscript_comments (
              id TEXT PRIMARY KEY,
              author_id TEXT NOT NULL,
              author_label TEXT NOT NULL,
              body TEXT NOT NULL,
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              excerpt TEXT NOT NULL,
              anchor_version INTEGER NOT NULL CHECK (anchor_version = 1),
              relative_start BLOB NOT NULL,
              relative_end BLOB NOT NULL,
              quote_prefix TEXT NOT NULL,
              quote_suffix TEXT NOT NULL,
              anchored_revision INTEGER NOT NULL,
              project_file_id TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS manuscript_comments_status ON manuscript_comments(status, updated_at DESC);
          `);
        const revisions = sql.exec<MigrationProjectRevisionRow>("SELECT * FROM project_revisions").toArray();
        for (const revision of revisions) {
          const snapshot: unknown = JSON.parse(revision.snapshot_json);
          if (!isRecordValue(snapshot) || !isRecordValue(snapshot.tables) || "manuscript_comments" in snapshot.tables) continue;
          snapshot.tables.manuscript_comments = [];
          sql.exec("UPDATE project_revisions SET snapshot_json = ? WHERE revision = ?", JSON.stringify(snapshot), revision.revision);
        }
        return undefined;
      },
    },
    {
      version: 17,
      name: "store-project-publication-profile",
      apply(sql): undefined {
        const columns = sql.exec<{ name: string }>("PRAGMA table_info(workspace)").toArray();
        if (!columns.some((column) => column.name === "settings_json")) {
          sql.exec(
            `ALTER TABLE workspace ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{"publicationProfile":{"citationStyle":"apa","locale":"en-US"}}'`,
          );
        }
        return undefined;
      },
    },
    {
      version: 18,
      name: "persist-project-folders",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS project_folders (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE COLLATE NOCASE,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        const now = new Date().toISOString();
        for (const file of sql.exec<{ path: string }>("SELECT path FROM project_files").toArray()) {
          for (const path of dependencies.folderAncestors(file.path)) {
            sql.exec(
              "INSERT OR IGNORE INTO project_folders (id, path, created_at, updated_at) VALUES (?, ?, ?, ?)",
              crypto.randomUUID(),
              path,
              now,
              now,
            );
          }
        }
        for (const revision of sql.exec<MigrationProjectRevisionRow>("SELECT * FROM project_revisions").toArray()) {
          const snapshot: unknown = JSON.parse(revision.snapshot_json);
          if (!isRecordValue(snapshot) || !isRecordValue(snapshot.tables) || "project_folders" in snapshot.tables) continue;
          snapshot.tables.project_folders = [];
          sql.exec("UPDATE project_revisions SET snapshot_json = ? WHERE revision = ?", JSON.stringify(snapshot), revision.revision);
        }
        return undefined;
      },
    },
    {
      version: 19,
      name: "add-starter-bibliography-marker",
      apply: (sql): undefined => {
        const source = dependencies.document.getText("source");
        if (source.toString() !== legacyDefaultSource) return undefined;
        source.insert(source.length, defaultSource.slice(legacyDefaultSource.length));
        const nextSource = source.toString();
        const state = new Uint8Array(Y.encodeStateAsUpdate(dependencies.document)).buffer;
        const now = new Date().toISOString();
        sql.exec("UPDATE workspace SET y_state = ?, source = ? WHERE id = 1", state, nextSource);
        sql.exec("UPDATE project_files SET content = ?, updated_at = ? WHERE y_text_name = 'source'", nextSource, now);
        return undefined;
      },
    },
    {
      version: 20,
      name: "persist-model-claim-candidates",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS claim_candidates (
              id TEXT PRIMARY KEY,
              operation TEXT NOT NULL CHECK (operation = 'draft-claim'),
              prompt_version TEXT NOT NULL CHECK (prompt_version = 'draft-claim-v1'),
              provider_adapter TEXT NOT NULL CHECK (provider_adapter = 'openai-compatible'),
              provider_label TEXT NOT NULL,
              model TEXT NOT NULL,
              instruction TEXT NOT NULL,
              relation TEXT NOT NULL CHECK (relation IN ('supports', 'contradicts', 'extends')),
              evidence_json TEXT NOT NULL,
              proposed_text TEXT NOT NULL,
              proposed_note TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
              created_at TEXT NOT NULL
            );
          `);
        return undefined;
      },
    },
    {
      version: 21,
      name: "store-project-image-assets",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS project_assets (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE COLLATE NOCASE,
              media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif')),
              size INTEGER NOT NULL CHECK (size > 0),
              object_key TEXT NOT NULL UNIQUE,
              fingerprint TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        const now = new Date().toISOString();
        sql.exec(
          "INSERT OR IGNORE INTO project_folders (id, path, created_at, updated_at) VALUES (?, 'figures', ?, ?)",
          crypto.randomUUID(),
          now,
          now,
        );
        for (const revision of sql.exec<MigrationProjectRevisionRow>("SELECT * FROM project_revisions").toArray()) {
          const snapshot: unknown = JSON.parse(revision.snapshot_json);
          if (!isRecordValue(snapshot) || !isRecordValue(snapshot.tables) || "project_assets" in snapshot.tables) continue;
          snapshot.tables.project_assets = [];
          sql.exec("UPDATE project_revisions SET snapshot_json = ? WHERE revision = ?", JSON.stringify(snapshot), revision.revision);
        }
        return undefined;
      },
    },
    {
      version: 22,
      name: "document-new-starter-projects",
      apply: (sql): undefined => {
        const revisions = sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_revisions").toArray()[0]?.count ?? 0;
        if (revisions > 0 || dependencies.workspaceRow().source !== defaultSource) return undefined;
        const files = sql.exec<MigrationProjectFileRow>("SELECT * FROM project_files ORDER BY path COLLATE NOCASE, id").toArray();
        if (
          files.length !== 2 ||
          !files.some((file) => file.path === projectEntryPath && file.content === defaultSource) ||
          !files.some((file) => file.path === defaultTransclusionPath && file.content === defaultTransclusionSource)
        )
          return undefined;
        const guideId = crypto.randomUUID();
        const guideYTextName = `file:${guideId}`;
        dependencies.document.getText(guideYTextName).insert(0, defaultGuideSource);
        const now = new Date().toISOString();
        sql.exec(
          `INSERT INTO project_files (id, path, media_type, y_text_name, content, created_at, updated_at)
             VALUES (?, ?, 'text/markdown', ?, ?, ?, ?)`,
          guideId,
          defaultGuidePath,
          guideYTextName,
          defaultGuideSource,
          now,
          now,
        );
        const state = new Uint8Array(Y.encodeStateAsUpdate(dependencies.document)).buffer;
        sql.exec("UPDATE workspace SET y_state = ? WHERE id = 1", state);
        return undefined;
      },
    },
    {
      version: 23,
      name: "allow-inert-svg-project-assets",
      apply(sql): undefined {
        sql.exec(`
            ALTER TABLE project_assets RENAME TO project_assets_raster_only;
            CREATE TABLE project_assets (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE COLLATE NOCASE,
              media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml')),
              size INTEGER NOT NULL CHECK (size > 0),
              object_key TEXT NOT NULL UNIQUE,
              fingerprint TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            INSERT INTO project_assets (id, path, media_type, size, object_key, fingerprint, created_at, updated_at)
            SELECT id, path, media_type, size, object_key, fingerprint, created_at, updated_at
            FROM project_assets_raster_only;
            DROP TABLE project_assets_raster_only;
          `);
        return undefined;
      },
    },
    {
      version: 24,
      name: "retain-github-project-sync-state",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS github_project_binding (
              singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
              installation_id INTEGER NOT NULL,
              repository_id INTEGER NOT NULL,
              owner TEXT NOT NULL,
              repository TEXT NOT NULL,
              branch TEXT NOT NULL,
              root_path TEXT NOT NULL,
              synchronized_commit TEXT NOT NULL,
              synchronized_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS github_tracked_files (
              file_id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE,
              blob_sha TEXT NOT NULL,
              content TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS github_publish_previews (
              id TEXT PRIMARY KEY,
              expected_revision INTEGER NOT NULL,
              expected_remote_head TEXT NOT NULL,
              commit_message TEXT NOT NULL,
              comparison_json TEXT NOT NULL,
              plan_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS github_publish_previews_expiry ON github_publish_previews(expires_at);
          `);
        return undefined;
      },
    },
    {
      version: 25,
      name: "retain-github-pull-previews",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS github_pull_previews (
              id TEXT PRIMARY KEY,
              expected_revision INTEGER NOT NULL,
              expected_remote_head TEXT NOT NULL,
              comparison_json TEXT NOT NULL,
              plan_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS github_pull_previews_expiry ON github_pull_previews(expires_at);
          `);
        return undefined;
      },
    },
    {
      version: 26,
      name: "pin-materialized-review-artifacts",
      apply(sql): undefined {
        sql.exec(`
            CREATE TABLE IF NOT EXISTS review_artifact_pins (
              path TEXT PRIMARY KEY REFERENCES project_files(path) ON UPDATE CASCADE ON DELETE CASCADE,
              review_revision INTEGER NOT NULL CHECK (review_revision > 0),
              protocol_revision INTEGER NOT NULL CHECK (protocol_revision > 0),
              analysis_definition_id TEXT NOT NULL,
              analysis_definition_revision INTEGER NOT NULL CHECK (analysis_definition_revision > 0),
              digest TEXT NOT NULL,
              generated_at TEXT NOT NULL
            );
          `);
        return undefined;
      },
    },
    {
      version: 27,
      name: "link-independent-reviews",
      apply(sql): undefined {
        const pinColumns = new Set(
          sql
            .exec<{ name: string }>("PRAGMA table_info(review_artifact_pins)")
            .toArray()
            .map((column) => column.name),
        );
        const provenanceColumns = [
          ["review_id", "TEXT NOT NULL DEFAULT 'legacy-project-review'"],
          ["link_id", "TEXT NOT NULL DEFAULT 'legacy-project-review-link'"],
          ["publication_id", "TEXT NOT NULL DEFAULT 'legacy-review-publication'"],
          ["generator", "TEXT NOT NULL DEFAULT 'kirjolab-review-synthesis'"],
          ["generator_schema", "TEXT NOT NULL DEFAULT 'kirjolab-review-analysis-v1'"],
          ["published_by", "TEXT NOT NULL DEFAULT 'legacy-unattributed'"],
        ] as const;
        for (const [name, definition] of provenanceColumns) {
          if (!pinColumns.has(name)) sql.exec(`ALTER TABLE review_artifact_pins ADD COLUMN ${name} ${definition}`);
        }
        sql.exec(`
            UPDATE review_artifact_pins
            SET publication_id = 'legacy-' || digest,
                link_id = 'legacy-' || substr(digest, 1, 64)
            WHERE review_id = 'legacy-project-review';

            CREATE TABLE IF NOT EXISTS project_review_links (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              review_id TEXT NOT NULL,
              review_access_locator TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('active', 'unlinked')),
              created_by TEXT NOT NULL,
              created_at TEXT NOT NULL,
              unlinked_by TEXT,
              unlinked_at TEXT,
              CHECK (
                (status = 'active' AND unlinked_by IS NULL AND unlinked_at IS NULL) OR
                (status = 'unlinked' AND unlinked_by IS NOT NULL AND unlinked_at IS NOT NULL)
              )
            );
            CREATE UNIQUE INDEX IF NOT EXISTS project_review_links_active_review
            ON project_review_links(project_id, review_id)
            WHERE status = 'active';
            CREATE INDEX IF NOT EXISTS project_review_links_review
            ON project_review_links(review_id, status, created_at DESC);
          `);
        return undefined;
      },
    },
  ];
}
