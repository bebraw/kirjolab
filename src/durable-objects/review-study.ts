import { DurableObject } from "cloudflare:workers";
import {
  defaultReviewProtocol,
  materializeProtocolRevision,
  parseReviewProtocolContent,
  type ReviewProfile,
  type ReviewProtocolContent,
  type ReviewProtocolRevision,
  type ReviewStudySnapshot,
} from "../domain/review-study";
import {
  previewReviewBibTeX,
  reviewAggregateLimits,
  reviewBibTeXImport,
  reviewDuplicateKeys,
  reviewImportLimits,
  type ReviewDuplicateCandidate,
  type ReviewDuplicateMatch,
  type ReviewImportBatch,
  type ReviewImportRecord,
  type ReviewImportedOccurrence,
  type ReviewRecord,
  type ReviewSearchRun,
  type ReviewSearchSnapshot,
} from "../domain/review-search";
import {
  fullTextScreeningAllowed,
  screeningStageState,
  type ReviewScreeningSnapshot,
  type ScreeningAdjudication,
  type ScreeningDecision,
  type ScreeningDecisionValue,
  type ScreeningRecordState,
  type ScreeningStage,
} from "../domain/review-screening";
import {
  parseEvidencePointer,
  summarizeEvidenceRecord,
  validateExtractionValue,
  validateQualityAssessment,
  type ExtractedDataValue,
  type ExtractionValue,
  type QualityAssessmentValue,
  type ReviewEvidencePointer,
  type ReviewEvidenceSnapshot,
} from "../domain/review-evidence";
import { buildReviewSynthesis, type ReviewSynthesis } from "../domain/review-synthesis";
import type { ReviewExportAuthority } from "../domain/review-export";
import {
  parseExtractionModelResult,
  parseScreeningModelResult,
  type ExtractionModelResult,
  type ReviewModelCandidate,
  type ReviewModelOperation,
  type ReviewModelSnapshot,
} from "../domain/review-model";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

const migrations = [
  {
    version: 1,
    name: "store-review-protocol-revisions",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE review_meta (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          revision INTEGER NOT NULL CHECK (revision >= 0)
        );
        INSERT INTO review_meta (singleton, revision) VALUES (1, 0);
        CREATE TABLE protocol_revisions (
          revision INTEGER PRIMARY KEY CHECK (revision > 0),
          status TEXT NOT NULL CHECK (status IN ('draft', 'frozen')),
          payload_json TEXT NOT NULL,
          rationale TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
  {
    version: 2,
    name: "store-search-runs-and-reviewed-duplicates",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE search_runs (
          id TEXT PRIMARY KEY,
          protocol_revision INTEGER NOT NULL,
          source_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          query TEXT NOT NULL,
          searched_at TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          imported_by TEXT NOT NULL,
          digest TEXT NOT NULL,
          detected_entries INTEGER NOT NULL,
          skipped_entries INTEGER NOT NULL,
          occurrence_count INTEGER NOT NULL
        );
        CREATE TABLE review_records (
          id TEXT PRIMARY KEY,
          state TEXT NOT NULL CHECK (state IN ('active', 'merged')),
          merged_into TEXT,
          metadata_json TEXT NOT NULL
        );
        CREATE TABLE imported_occurrences (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES search_runs(id),
          record_id TEXT NOT NULL REFERENCES review_records(id),
          citation_key TEXT NOT NULL,
          imported_json TEXT NOT NULL
        );
        CREATE TABLE duplicate_candidates (
          id TEXT PRIMARY KEY,
          left_id TEXT NOT NULL REFERENCES review_records(id),
          right_id TEXT NOT NULL REFERENCES review_records(id),
          signals_json TEXT NOT NULL,
          confidence TEXT NOT NULL CHECK (confidence IN ('exact', 'probable')),
          status TEXT NOT NULL CHECK (status IN ('pending', 'merged', 'distinct', 'superseded')),
          resolved_at TEXT,
          resolved_by TEXT,
          UNIQUE(left_id, right_id)
        );
        CREATE INDEX imported_occurrences_run_idx ON imported_occurrences(run_id);
        CREATE INDEX imported_occurrences_record_idx ON imported_occurrences(record_id);
      `);
      return undefined;
    },
  },
  {
    version: 3,
    name: "store-append-only-screening-decisions",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE screening_decisions (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          stage TEXT NOT NULL CHECK (stage IN ('title-abstract', 'full-text')),
          reviewer TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('include', 'exclude', 'uncertain')),
          reason TEXT NOT NULL,
          criterion TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE screening_adjudications (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          stage TEXT NOT NULL CHECK (stage IN ('title-abstract', 'full-text')),
          outcome TEXT NOT NULL CHECK (outcome IN ('include', 'exclude')),
          reason TEXT NOT NULL,
          adjudicator TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX screening_decisions_record_stage_idx ON screening_decisions(record_id, stage, created_at);
        CREATE INDEX screening_adjudications_record_stage_idx ON screening_adjudications(record_id, stage, created_at);
      `);
      return undefined;
    },
  },
  {
    version: 4,
    name: "store-evidence-linked-appraisal-and-extraction",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE quality_assessment_values (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          question_id TEXT NOT NULL,
          answer_id TEXT NOT NULL,
          evidence_json TEXT NOT NULL,
          reviewer TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE extracted_data_values (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          field_id TEXT NOT NULL,
          value_json TEXT NOT NULL,
          missing_reason TEXT,
          evidence_json TEXT,
          reviewer TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX quality_values_record_idx ON quality_assessment_values(record_id, question_id, created_at);
        CREATE INDEX extraction_values_record_idx ON extracted_data_values(record_id, field_id, created_at);
      `);
      return undefined;
    },
  },
  {
    version: 5,
    name: "store-review-model-candidates",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE review_model_candidates (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL CHECK (operation IN ('screen-record', 'extract-field')),
          record_id TEXT NOT NULL REFERENCES review_records(id),
          stage TEXT CHECK (stage IN ('title-abstract', 'full-text')),
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_template_version TEXT NOT NULL,
          source_scope_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          disposition TEXT NOT NULL CHECK (disposition IN ('pending', 'accepted', 'rejected')),
          disposed_at TEXT,
          disposed_by TEXT
        );
        CREATE INDEX review_model_candidates_record_idx ON review_model_candidates(record_id, created_at);
      `);
      return undefined;
    },
  },
  {
    version: 6,
    name: "allow-rationales-for-negative-appraisal",
    apply(sql): undefined {
      sql.exec("ALTER TABLE quality_assessment_values ADD COLUMN rationale TEXT NOT NULL DEFAULT '';");
      return undefined;
    },
  },
  {
    version: 7,
    name: "make-review-revisions-reconstructible",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE review_meta ADD COLUMN history_floor_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE search_runs ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_records ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_records ADD COLUMN merged_revision INTEGER;
        ALTER TABLE imported_occurrences ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE duplicate_candidates ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE duplicate_candidates ADD COLUMN resolved_revision INTEGER;
        ALTER TABLE screening_decisions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE screening_adjudications ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE quality_assessment_values ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE extracted_data_values ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_model_candidates ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_model_candidates ADD COLUMN disposed_revision INTEGER;

        UPDATE review_meta SET history_floor_revision = revision WHERE singleton = 1;
        UPDATE search_runs SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_records SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_records
          SET merged_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1)
          WHERE state = 'merged';
        UPDATE imported_occurrences SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE duplicate_candidates SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE duplicate_candidates
          SET resolved_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1)
          WHERE status <> 'pending';
        UPDATE screening_decisions SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE screening_adjudications SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE quality_assessment_values SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE extracted_data_values SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_model_candidates SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_model_candidates
          SET disposed_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1)
          WHERE disposition <> 'pending';

        CREATE INDEX search_runs_revision_idx ON search_runs(created_revision);
        CREATE INDEX review_records_revision_idx ON review_records(created_revision, merged_revision);
        CREATE INDEX imported_occurrences_revision_idx ON imported_occurrences(created_revision);
        CREATE INDEX duplicate_candidates_revision_idx ON duplicate_candidates(created_revision, resolved_revision);
        CREATE INDEX screening_decisions_revision_idx ON screening_decisions(revision);
        CREATE INDEX screening_adjudications_revision_idx ON screening_adjudications(revision);
        CREATE INDEX quality_values_revision_idx ON quality_assessment_values(revision);
        CREATE INDEX extraction_values_revision_idx ON extracted_data_values(revision);
        CREATE INDEX review_model_candidates_revision_idx ON review_model_candidates(created_revision, disposed_revision);
      `);
      return undefined;
    },
  },
  {
    version: 8,
    name: "retain-review-import-provenance-and-capacity",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE review_meta ADD COLUMN search_run_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_meta ADD COLUMN import_batch_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_meta ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_meta ADD COLUMN record_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE search_runs ADD COLUMN reported_result_count INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE review_import_batches (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES search_runs(id),
          format TEXT NOT NULL CHECK (format = 'bibtex'),
          filename TEXT NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type = 'application/x-bibtex'),
          byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
          digest TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          reported_result_count INTEGER NOT NULL CHECK (reported_result_count >= 0),
          created_revision INTEGER NOT NULL
        );
        ALTER TABLE imported_occurrences ADD COLUMN batch_id TEXT REFERENCES review_import_batches(id);
        CREATE INDEX review_import_batches_run_idx ON review_import_batches(run_id, created_revision);
        CREATE INDEX imported_occurrences_batch_idx ON imported_occurrences(batch_id, created_revision);

        CREATE TABLE review_record_duplicate_keys (
          record_id TEXT PRIMARY KEY REFERENCES review_records(id),
          doi_key TEXT NOT NULL,
          title_author_year_key TEXT NOT NULL,
          title_year_key TEXT NOT NULL,
          created_revision INTEGER NOT NULL
        );
        CREATE INDEX review_record_doi_key_idx ON review_record_duplicate_keys(doi_key, created_revision, record_id);
        CREATE INDEX review_record_title_author_year_key_idx
          ON review_record_duplicate_keys(title_author_year_key, created_revision, record_id);
        CREATE INDEX review_record_title_year_key_idx
          ON review_record_duplicate_keys(title_year_key, created_revision, record_id);
      `);

      const legacyRuns = sql
        .exec<{
          id: string;
          digest: string;
          detected_entries: number;
          created_revision: number;
        }>("SELECT id, digest, detected_entries, created_revision FROM search_runs ORDER BY id ASC")
        .toArray();
      for (const run of legacyRuns) {
        const batchId = `legacy-${run.id}`;
        sql.exec(
          "INSERT INTO review_import_batches (id, run_id, format, filename, media_type, byte_count, digest, parser_version, reported_result_count, created_revision) VALUES (?, ?, 'bibtex', 'unrecorded-pre-v8.bib', 'application/x-bibtex', 0, ?, 'legacy-unrecorded', ?, ?)",
          batchId,
          run.id,
          run.digest,
          run.detected_entries,
          run.created_revision,
        );
        sql.exec("UPDATE search_runs SET reported_result_count = ? WHERE id = ?", run.detected_entries, run.id);
        sql.exec("UPDATE imported_occurrences SET batch_id = ? WHERE run_id = ?", batchId, run.id);
      }

      const legacyRecords = sql
        .exec<{
          id: string;
          metadata_json: string;
          created_revision: number;
        }>("SELECT id, metadata_json, created_revision FROM review_records ORDER BY id ASC")
        .toArray();
      for (const row of legacyRecords) {
        const keys = reviewDuplicateKeys(importRecord(row.metadata_json));
        sql.exec(
          "INSERT INTO review_record_duplicate_keys (record_id, doi_key, title_author_year_key, title_year_key, created_revision) VALUES (?, ?, ?, ?, ?)",
          row.id,
          keys.doi,
          keys.titleAuthorYear,
          keys.titleYear,
          row.created_revision,
        );
      }

      sql.exec(`
        UPDATE review_meta SET
          search_run_count = (SELECT COUNT(*) FROM search_runs),
          import_batch_count = (SELECT COUNT(*) FROM review_import_batches),
          occurrence_count = (SELECT COUNT(*) FROM imported_occurrences),
          record_count = (SELECT COUNT(*) FROM review_records)
        WHERE singleton = 1;
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface MetaRow extends Record<string, SqlStorageValue> {
  revision: number;
  history_floor_revision: number;
  search_run_count: number;
  import_batch_count: number;
  occurrence_count: number;
  record_count: number;
}

interface ProtocolRow extends Record<string, SqlStorageValue> {
  revision: number;
  status: "draft" | "frozen";
  payload_json: string;
  rationale: string;
  created_at: string;
  created_by: string;
}

interface SearchRunRow extends Record<string, SqlStorageValue> {
  id: string;
  protocol_revision: number;
  source_id: string;
  source_name: string;
  query: string;
  searched_at: string;
  imported_at: string;
  imported_by: string;
  digest: string;
  detected_entries: number;
  skipped_entries: number;
  occurrence_count: number;
  created_revision: number;
  reported_result_count: number;
}

interface ImportBatchRow extends Record<string, SqlStorageValue> {
  id: string;
  run_id: string;
  format: typeof reviewBibTeXImport.format;
  filename: string;
  media_type: typeof reviewBibTeXImport.mediaType;
  byte_count: number;
  digest: string;
  parser_version: string;
  reported_result_count: number;
  created_revision: number;
}

interface ReviewRecordRow extends Record<string, SqlStorageValue> {
  id: string;
  state: "active" | "merged";
  merged_into: string | null;
  metadata_json: string;
  created_revision: number;
  merged_revision: number | null;
}

interface OccurrenceRow extends Record<string, SqlStorageValue> {
  id: string;
  run_id: string;
  record_id: string;
  citation_key: string;
  imported_json: string;
  created_revision: number;
  batch_id: string;
}

interface DuplicateCandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  left_id: string;
  right_id: string;
  signals_json: string;
  confidence: "exact" | "probable";
  status: "pending" | "merged" | "distinct" | "superseded";
  resolved_at: string | null;
  resolved_by: string | null;
  created_revision: number;
  resolved_revision: number | null;
}

interface ScreeningDecisionRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  stage: ScreeningStage;
  reviewer: string;
  decision: ScreeningDecisionValue;
  reason: string;
  criterion: string;
  created_at: string;
  revision: number;
}

interface ScreeningAdjudicationRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  stage: ScreeningStage;
  outcome: "include" | "exclude";
  reason: string;
  adjudicator: string;
  created_at: string;
  revision: number;
}

interface QualityValueRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  question_id: string;
  answer_id: string;
  evidence_json: string;
  rationale: string;
  reviewer: string;
  created_at: string;
  revision: number;
}

interface ExtractionValueRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  field_id: string;
  value_json: string;
  missing_reason: string | null;
  evidence_json: string | null;
  reviewer: string;
  created_at: string;
  revision: number;
}

interface ModelCandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  operation: ReviewModelOperation;
  record_id: string;
  stage: ScreeningStage | null;
  provider: string;
  model: string;
  prompt_template_version: string;
  source_scope_json: string;
  result_json: string;
  created_at: string;
  created_by: string;
  disposition: "pending" | "accepted" | "rejected";
  disposed_at: string | null;
  disposed_by: string | null;
  created_revision: number;
  disposed_revision: number | null;
}

interface DuplicateKeyMatchRow extends Record<string, SqlStorageValue> {
  record_id: string;
  doi_match_id: string | null;
  title_author_year_match_id: string | null;
  title_year_match_id: string | null;
}

export interface ReplaceReviewProtocolInput {
  readonly expectedRevision: number;
  readonly content: ReviewProtocolContent;
  readonly rationale?: string;
  readonly actor: string;
}

export interface AmendReviewProtocolInput extends ReplaceReviewProtocolInput {
  readonly rationale: string;
}

export interface ConfirmReviewSearchRunInput {
  readonly expectedRevision: number;
  readonly sourceId: string;
  readonly query: string;
  readonly searchedAt: string;
  readonly bibtex: string;
  readonly digest: string;
  readonly filename: string;
  readonly mediaType: typeof reviewBibTeXImport.mediaType;
  readonly reportedResultCount: number;
  readonly actor: string;
}

export interface CreateReviewModelCandidateInput {
  readonly expectedRevision: number;
  readonly operation: ReviewModelOperation;
  readonly recordId: string;
  readonly stage: ScreeningStage | null;
  readonly provider: string;
  readonly model: string;
  readonly promptTemplateVersion: string;
  readonly sourceScope: readonly string[];
  readonly result: unknown;
  readonly actor: string;
}

export class ReviewStudy extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  getSnapshot(profile: ReviewProfile = "slr", actor = "system"): ReviewStudySnapshot {
    const rows = this.protocolRows();
    if (rows.length === 0) {
      this.appendProtocol(defaultReviewProtocol(profile), "draft", "Review study created", actor);
      return this.getSnapshot(profile, actor);
    }
    return this.studySnapshotAtRevision(this.currentRevision());
  }

  replaceProtocol(input: ReplaceReviewProtocolInput): ReviewStudySnapshot {
    const current = this.getSnapshot();
    this.assertRevision(input.expectedRevision, current.revision);
    if (current.protocol.status === "frozen") throw new Error("Frozen protocol must be amended with a rationale");
    parseReviewProtocolContent(input.content);
    this.appendProtocol(input.content, "draft", input.rationale ?? "Protocol edited", input.actor);
    return this.getSnapshot();
  }

  freezeProtocol(expectedRevision: number, actor: string): ReviewStudySnapshot {
    const current = this.getSnapshot();
    this.assertRevision(expectedRevision, current.revision);
    if (current.protocol.status === "frozen") return current;
    this.appendProtocol(current.protocol, "frozen", "Protocol frozen before search", actor);
    return this.getSnapshot();
  }

  amendProtocol(input: AmendReviewProtocolInput): ReviewStudySnapshot {
    const current = this.getSnapshot();
    this.assertRevision(input.expectedRevision, current.revision);
    if (current.protocol.status !== "frozen") throw new Error("Only a frozen protocol requires an amendment");
    if (!input.rationale.trim()) throw new Error("Protocol amendment rationale is required");
    parseReviewProtocolContent(input.content);
    this.appendProtocol(input.content, "frozen", input.rationale, input.actor);
    return this.getSnapshot();
  }

  getSearchSnapshot(): ReviewSearchSnapshot {
    return this.searchSnapshotAtRevision(this.currentRevision());
  }

  private searchSnapshotAtRevision(revision: number): ReviewSearchSnapshot {
    const batches = this.ctx.storage.sql
      .exec<ImportBatchRow>(
        "SELECT * FROM review_import_batches WHERE created_revision <= ? ORDER BY created_revision ASC, id ASC",
        revision,
      )
      .toArray()
      .map(importBatchFromRow);
    const batchIdsByRun = new Map<string, string[]>();
    for (const batch of batches) {
      const ids = batchIdsByRun.get(batch.runId) ?? [];
      ids.push(batch.id);
      batchIdsByRun.set(batch.runId, ids);
    }
    const runs = this.ctx.storage.sql
      .exec<SearchRunRow>("SELECT * FROM search_runs WHERE created_revision <= ? ORDER BY imported_at ASC, id ASC", revision)
      .toArray()
      .map((row) => runFromRow(row, batchIdsByRun.get(row.id) ?? []));
    const recordRows = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE created_revision <= ? ORDER BY id ASC", revision)
      .toArray();
    const records = recordRows.map((row) => recordFromRowAtRevision(row, revision));
    const recordById = new Map(records.map((record) => [record.id, record] as const));
    const occurrences = this.ctx.storage.sql
      .exec<OccurrenceRow>("SELECT * FROM imported_occurrences WHERE created_revision <= ? ORDER BY run_id ASC, id ASC", revision)
      .toArray()
      .map(occurrenceFromRow)
      .map((occurrence) => ({ ...occurrence, recordId: canonicalRecordIdAtRevision(occurrence.recordId, recordById) }));
    const duplicateCandidates = this.ctx.storage.sql
      .exec<DuplicateCandidateRow>(
        "SELECT * FROM duplicate_candidates WHERE created_revision <= ? ORDER BY status DESC, confidence ASC, id ASC",
        revision,
      )
      .toArray()
      .map((row) => candidateFromRowAtRevision(row, revision))
      .sort(compareDuplicateCandidates);
    const activeRecords = records.filter((record) => record.state === "active").length;
    return {
      revision,
      runs,
      batches,
      occurrences,
      records,
      duplicateCandidates,
      counts: { identified: occurrences.length, unique: activeRecords, duplicatesRemoved: occurrences.length - activeRecords },
    };
  }

  async confirmSearchRun(input: ConfirmReviewSearchRunInput): Promise<ReviewSearchSnapshot> {
    const current = this.getSnapshot();
    this.assertRevision(input.expectedRevision, current.revision);
    if (current.protocol.status !== "frozen") throw new Error("Freeze the review protocol before importing a search run");
    const source = current.protocol.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) throw new Error("Review search source is not in the current protocol");
    const query = input.query.trim();
    if (!query || query.length > 20_000) throw new Error("Review search query is invalid");
    const searchedAt = validTimestamp(input.searchedAt, "Review search date");
    const provenance = reviewImportProvenance(input);
    const preview = await previewReviewBibTeX(input.bibtex);
    if (preview.digest !== input.digest) throw new Error("Review import changed after preview");
    this.assertRevision(input.expectedRevision, this.currentRevision());
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const createdRecords = preview.records.map((metadata) => ({ id: crypto.randomUUID(), metadata }));
    this.ctx.storage.transactionSync(() => {
      this.assertImportCapacity(preview.records.length);
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "INSERT INTO search_runs (id, protocol_revision, source_id, source_name, query, searched_at, imported_at, imported_by, digest, detected_entries, skipped_entries, occurrence_count, created_revision, reported_result_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        runId,
        current.protocol.revision,
        source.id,
        source.name,
        query,
        searchedAt,
        now,
        input.actor,
        preview.digest,
        preview.detectedEntries,
        preview.skippedEntries,
        preview.records.length,
        revision,
        provenance.reportedResultCount,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO review_import_batches (id, run_id, format, filename, media_type, byte_count, digest, parser_version, reported_result_count, created_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        batchId,
        runId,
        preview.format,
        provenance.filename,
        provenance.mediaType,
        preview.byteCount,
        preview.digest,
        preview.parserVersion,
        provenance.reportedResultCount,
        revision,
      );
      for (const record of createdRecords) {
        this.ctx.storage.sql.exec(
          "INSERT INTO review_records (id, state, merged_into, metadata_json, created_revision, merged_revision) VALUES (?, 'active', NULL, ?, ?, NULL)",
          record.id,
          JSON.stringify(record.metadata),
          revision,
        );
        const keys = reviewDuplicateKeys(record.metadata);
        this.ctx.storage.sql.exec(
          "INSERT INTO review_record_duplicate_keys (record_id, doi_key, title_author_year_key, title_year_key, created_revision) VALUES (?, ?, ?, ?, ?)",
          record.id,
          keys.doi,
          keys.titleAuthorYear,
          keys.titleYear,
          revision,
        );
        this.ctx.storage.sql.exec(
          "INSERT INTO imported_occurrences (id, run_id, record_id, citation_key, imported_json, created_revision, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(),
          runId,
          record.id,
          record.metadata.citationKey,
          JSON.stringify(record.metadata),
          revision,
          batchId,
        );
      }
      for (const match of this.duplicateMatchesForRevision(revision)) this.insertDuplicateCandidate(match, revision);
      this.ctx.storage.sql.exec(
        "UPDATE review_meta SET search_run_count = search_run_count + 1, import_batch_count = import_batch_count + 1, occurrence_count = occurrence_count + ?, record_count = record_count + ? WHERE singleton = 1",
        preview.records.length,
        preview.records.length,
      );
    });
    return this.getSearchSnapshot();
  }

  resolveDuplicate(
    expectedRevision: number,
    candidateId: string,
    action: "merge" | "distinct",
    canonicalRecordId: string | null,
    actor: string,
  ): ReviewSearchSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const candidateRow = this.ctx.storage.sql
      .exec<DuplicateCandidateRow>("SELECT * FROM duplicate_candidates WHERE id = ?", candidateId)
      .toArray()[0];
    if (!candidateRow || candidateRow.status !== "pending") throw new Error("Review duplicate candidate is unavailable");
    const screeningCount = this.ctx.storage.sql
      .exec<{
        count: number;
      }>(
        "SELECT COUNT(*) AS count FROM screening_decisions WHERE record_id = ? OR record_id = ?",
        candidateRow.left_id,
        candidateRow.right_id,
      )
      .one().count;
    if (screeningCount > 0) throw new Error("Resolve duplicate candidates before screening their records");
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      if (action === "merge") {
        if (canonicalRecordId !== candidateRow.left_id && canonicalRecordId !== candidateRow.right_id) {
          throw new Error("Canonical review record is invalid");
        }
        const duplicateId = canonicalRecordId === candidateRow.left_id ? candidateRow.right_id : candidateRow.left_id;
        this.ctx.storage.sql.exec(
          "UPDATE review_records SET state = 'merged', merged_into = ?, merged_revision = ? WHERE id = ?",
          canonicalRecordId,
          revision,
          duplicateId,
        );
        this.ctx.storage.sql.exec(
          "UPDATE duplicate_candidates SET status = 'superseded', resolved_at = ?, resolved_by = ?, resolved_revision = ? WHERE id <> ? AND status = 'pending' AND (left_id = ? OR right_id = ?)",
          now,
          actor,
          revision,
          candidateId,
          duplicateId,
          duplicateId,
        );
      }
      this.ctx.storage.sql.exec(
        "UPDATE duplicate_candidates SET status = ?, resolved_at = ?, resolved_by = ?, resolved_revision = ? WHERE id = ?",
        action === "merge" ? "merged" : "distinct",
        now,
        actor,
        revision,
        candidateId,
      );
    });
    return this.getSearchSnapshot();
  }

  getScreeningSnapshot(actor: string): ReviewScreeningSnapshot {
    return this.screeningSnapshotAtRevision(this.currentRevision(), actor);
  }

  private screeningSnapshotAtRevision(revision: number, actor: string): ReviewScreeningSnapshot {
    const protocol = this.studySnapshotAtRevision(revision).protocol;
    const decisions = this.ctx.storage.sql
      .exec<ScreeningDecisionRow>("SELECT * FROM screening_decisions WHERE revision <= ? ORDER BY created_at ASC, id ASC", revision)
      .toArray()
      .map(decisionFromRow);
    const adjudications = this.ctx.storage.sql
      .exec<ScreeningAdjudicationRow>("SELECT * FROM screening_adjudications WHERE revision <= ? ORDER BY created_at ASC, id ASC", revision)
      .toArray()
      .map(adjudicationFromRow);
    const records = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE created_revision <= ? ORDER BY id ASC", revision)
      .toArray()
      .map((row) => recordFromRowAtRevision(row, revision))
      .filter((record) => record.state === "active")
      .map((record) =>
        screeningRecord(record, decisions, adjudications, protocol.screening.reviewersPerStage, protocol.screening.blinded, actor),
      );
    return {
      revision,
      reviewersPerStage: protocol.screening.reviewersPerStage,
      blinded: protocol.screening.blinded,
      records,
      counts: screeningCounts(records),
    };
  }

  submitScreeningDecision(
    expectedRevision: number,
    recordId: string,
    stage: ScreeningStage,
    decision: ScreeningDecisionValue,
    reason: string,
    criterion: string,
    actor: string,
  ): ReviewScreeningSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const record = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE id = ? AND state = 'active'", recordId)
      .toArray()[0];
    if (!record) throw new Error("Review screening record is unavailable");
    if (stage !== "title-abstract" && stage !== "full-text") throw new Error("Review screening stage is invalid");
    if (decision !== "include" && decision !== "exclude" && decision !== "uncertain")
      throw new Error("Review screening decision is invalid");
    const reasonValue = boundedScreeningText(reason, "Screening reason", 2_000, decision !== "exclude");
    const criterionValue = boundedScreeningText(criterion, "Screening criterion", 1_000, true);
    if (stage === "full-text") {
      const state = this.getScreeningSnapshot(actor).records.find((candidate) => candidate.record.id === recordId);
      if (!state || !fullTextScreeningAllowed(state)) throw new Error("Full-text screening requires title-and-abstract inclusion");
    }
    const priorCount = this.ctx.storage.sql
      .exec<{
        count: number;
      }>("SELECT COUNT(*) AS count FROM screening_decisions WHERE record_id = ? AND stage = ? AND reviewer = ?", recordId, stage, actor)
      .one().count;
    if (priorCount >= 20) throw new Error("Screening decision revision limit reached");
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "INSERT INTO screening_decisions (id, record_id, stage, reviewer, decision, reason, criterion, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        stage,
        actor,
        decision,
        reasonValue,
        criterionValue,
        new Date().toISOString(),
        revision,
      );
    });
    return this.getScreeningSnapshot(actor);
  }

  adjudicateScreening(
    expectedRevision: number,
    recordId: string,
    stage: ScreeningStage,
    outcome: "include" | "exclude",
    reason: string,
    actor: string,
  ): ReviewScreeningSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const state = this.getScreeningSnapshot(actor).records.find((candidate) => candidate.record.id === recordId);
    const stageState = stage === "title-abstract" ? state?.titleAbstract : state?.fullText;
    if (!stageState || stageState.outcome !== "conflict") throw new Error("Only a screening conflict can be adjudicated");
    if (outcome !== "include" && outcome !== "exclude") throw new Error("Screening adjudication outcome is invalid");
    const reasonValue = boundedScreeningText(reason, "Adjudication reason", 2_000, false);
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "INSERT INTO screening_adjudications (id, record_id, stage, outcome, reason, adjudicator, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        stage,
        outcome,
        reasonValue,
        actor,
        new Date().toISOString(),
        revision,
      );
    });
    return this.getScreeningSnapshot(actor);
  }

  getEvidenceSnapshot(actor: string): ReviewEvidenceSnapshot {
    return this.evidenceSnapshotAtRevision(this.currentRevision(), actor);
  }

  private evidenceSnapshotAtRevision(revision: number, actor: string): ReviewEvidenceSnapshot {
    const protocol = this.studySnapshotAtRevision(revision).protocol;
    const includedIds = new Set(
      this.screeningSnapshotAtRevision(revision, actor)
        .records.filter((record) => record.fullText.outcome === "include")
        .map((record) => record.record.id),
    );
    const records = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE created_revision <= ? ORDER BY id ASC", revision)
      .toArray()
      .map((row) => recordFromRowAtRevision(row, revision))
      .filter((record) => record.state === "active")
      .filter((record) => includedIds.has(record.id));
    const qualityValues = this.ctx.storage.sql
      .exec<QualityValueRow>("SELECT * FROM quality_assessment_values WHERE revision <= ? ORDER BY created_at ASC, id ASC", revision)
      .toArray()
      .map(qualityValueFromRow);
    const extractionValues = this.ctx.storage.sql
      .exec<ExtractionValueRow>("SELECT * FROM extracted_data_values WHERE revision <= ? ORDER BY created_at ASC, id ASC", revision)
      .toArray()
      .map(extractionValueFromRow);
    return {
      revision,
      protocolRevision: protocol.revision,
      protocol: {
        researchQuestions: protocol.researchQuestions,
        qualityAssessment: protocol.qualityAssessment,
        extractionFields: protocol.extractionFields,
      },
      records: records.map((record) =>
        summarizeEvidenceRecord(
          record,
          protocol,
          qualityValues.filter((value) => value.recordId === record.id),
          extractionValues.filter((value) => value.recordId === record.id),
        ),
      ),
    };
  }

  submitQualityAssessment(
    expectedRevision: number,
    recordId: string,
    questionId: string,
    answerId: string,
    evidence: ReviewEvidencePointer | null,
    rationale: string,
    actor: string,
  ): ReviewEvidenceSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const protocol = this.getSnapshot().protocol;
    if (!protocol.qualityAssessment.questions.some((question) => question.id === questionId))
      throw new Error("Quality question is unavailable");
    const answer = protocol.qualityAssessment.answers.find((candidate) => candidate.id === answerId);
    if (!answer) throw new Error("Quality answer is unavailable");
    this.assertEvidenceRecord(recordId, actor);
    const validated = validateQualityAssessment(answer, evidence, rationale);
    this.assertEvidenceRevisionLimit("quality_assessment_values", "question_id", recordId, questionId, actor);
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "INSERT INTO quality_assessment_values (id, record_id, question_id, answer_id, evidence_json, rationale, reviewer, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        questionId,
        answerId,
        JSON.stringify(validated.evidence),
        validated.rationale,
        actor,
        new Date().toISOString(),
        revision,
      );
    });
    return this.getEvidenceSnapshot(actor);
  }

  submitExtractionValue(
    expectedRevision: number,
    recordId: string,
    fieldId: string,
    value: ExtractionValue,
    missingReason: string | null,
    evidence: ReviewEvidencePointer | null,
    actor: string,
  ): ReviewEvidenceSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const protocol = this.getSnapshot().protocol;
    const field = protocol.extractionFields.find((candidate) => candidate.id === fieldId);
    if (!field) throw new Error("Extraction field is unavailable");
    this.assertEvidenceRecord(recordId, actor);
    const validated = validateExtractionValue(field, value, missingReason);
    const pointer = parseEvidencePointer(evidence, validated.value !== null);
    this.assertEvidenceRevisionLimit("extracted_data_values", "field_id", recordId, fieldId, actor);
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "INSERT INTO extracted_data_values (id, record_id, field_id, value_json, missing_reason, evidence_json, reviewer, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        fieldId,
        JSON.stringify(validated.value),
        validated.missingReason,
        pointer ? JSON.stringify(pointer) : null,
        actor,
        new Date().toISOString(),
        revision,
      );
    });
    return this.getEvidenceSnapshot(actor);
  }

  getModelSnapshot(actor: string): ReviewModelSnapshot {
    return this.modelSnapshotAtRevision(this.currentRevision(), actor);
  }

  private modelSnapshotAtRevision(revision: number, actor: string | null): ReviewModelSnapshot {
    const protocol = this.studySnapshotAtRevision(revision).protocol;
    const rows = this.ctx.storage.sql
      .exec<ModelCandidateRow>(
        "SELECT * FROM review_model_candidates WHERE created_revision <= ? ORDER BY created_at ASC, id ASC",
        revision,
      )
      .toArray();
    return {
      revision,
      candidates: rows
        .map((row) => modelCandidateFromRow(modelCandidateRowAtRevision(row, revision), protocol))
        .filter((candidate) => {
          if (actor === null || candidate.disposition !== "pending" || protocol.modelAssistance.mode !== "human-first") return true;
          if (candidate.operation === "screen-record") {
            return (
              this.ctx.storage.sql
                .exec<{
                  count: number;
                }>(
                  "SELECT COUNT(*) AS count FROM screening_decisions WHERE record_id = ? AND stage = ? AND reviewer = ? AND revision <= ?",
                  candidate.recordId,
                  candidate.stage,
                  actor,
                  revision,
                )
                .one().count > 0
            );
          }
          const result = candidate.result as import("../domain/review-model").ExtractionModelResult;
          return (
            this.ctx.storage.sql
              .exec<{
                count: number;
              }>(
                "SELECT COUNT(*) AS count FROM extracted_data_values WHERE record_id = ? AND field_id = ? AND reviewer = ? AND revision <= ?",
                candidate.recordId,
                result.fieldId,
                actor,
                revision,
              )
              .one().count > 0
          );
        }),
    };
  }

  createModelCandidate(input: CreateReviewModelCandidateInput): ReviewModelSnapshot {
    this.assertRevision(input.expectedRevision, this.currentRevision());
    const protocol = this.getSnapshot().protocol;
    if (protocol.modelAssistance.mode === "off") throw new Error("Enable model assistance in the protocol first");
    const recordRow = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE id = ? AND state = 'active'", input.recordId)
      .toArray()[0];
    if (!recordRow) throw new Error("Model candidate review record is unavailable");
    const provider = boundedScreeningText(input.provider, "Model provider", 256, false);
    const model = boundedScreeningText(input.model, "Model", 256, false);
    const promptTemplateVersion = boundedScreeningText(input.promptTemplateVersion, "Prompt template version", 128, false);
    if (!Array.isArray(input.sourceScope) || input.sourceScope.length === 0 || input.sourceScope.length > 16) {
      throw new Error("Model source scope is invalid");
    }
    const sourceScope = input.sourceScope.map((value) => boundedScreeningText(value, "Model source scope", 128, false));
    let result: ReturnType<typeof parseScreeningModelResult> | ReturnType<typeof parseExtractionModelResult>;
    if (input.operation === "screen-record") {
      if (input.stage !== "title-abstract") throw new Error("Current screening assistance is title-and-abstract only");
      result = parseScreeningModelResult(input.result);
      const record = recordFromRow(recordRow);
      if (!record.metadata.title.includes(result.evidence) && !record.metadata.abstract.includes(result.evidence)) {
        throw new Error("Screening candidate evidence must quote the supplied title or abstract exactly");
      }
      const criteria = [...protocol.inclusionCriteria, ...protocol.exclusionCriteria];
      if (result.criterion && !criteria.includes(result.criterion)) throw new Error("Screening candidate criterion is unavailable");
    } else if (input.operation === "extract-field") {
      if (input.stage !== null) throw new Error("Extraction candidates do not use a screening stage");
      this.assertEvidenceRecord(input.recordId, input.actor);
      const fieldId = isRecordValue(input.result) && typeof input.result.fieldId === "string" ? input.result.fieldId : "";
      const field = protocol.extractionFields.find((candidate) => candidate.id === fieldId);
      if (!field) throw new Error("Extraction candidate field is unavailable");
      result = parseExtractionModelResult(input.result, field);
    } else {
      throw new Error("Model candidate operation is invalid");
    }
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "INSERT INTO review_model_candidates (id, operation, record_id, stage, provider, model, prompt_template_version, source_scope_json, result_json, created_at, created_by, disposition, disposed_at, disposed_by, created_revision, disposed_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL)",
        crypto.randomUUID(),
        input.operation,
        input.recordId,
        input.stage,
        provider,
        model,
        promptTemplateVersion,
        JSON.stringify(sourceScope),
        JSON.stringify(result),
        new Date().toISOString(),
        input.actor,
        revision,
      );
    });
    return this.getModelSnapshot(input.actor);
  }

  resolveModelCandidate(
    expectedRevision: number,
    candidateId: string,
    disposition: "accepted" | "rejected",
    actor: string,
  ): ReviewModelSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const row = this.ctx.storage.sql
      .exec<ModelCandidateRow>("SELECT * FROM review_model_candidates WHERE id = ?", candidateId)
      .toArray()[0];
    if (!row || row.disposition !== "pending") throw new Error("Model candidate is unavailable");
    const protocol = this.getSnapshot().protocol;
    const candidate = modelCandidateFromRow(row, protocol);
    if (
      protocol.modelAssistance.mode === "human-first" &&
      !this.getModelSnapshot(actor).candidates.some((visible) => visible.id === candidate.id)
    ) {
      throw new Error("Human-first candidates require an initial human judgment before disposition");
    }
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      this.ctx.storage.sql.exec(
        "UPDATE review_model_candidates SET disposition = ?, disposed_at = ?, disposed_by = ?, disposed_revision = ? WHERE id = ?",
        disposition,
        now,
        actor,
        revision,
        candidateId,
      );
      if (disposition === "accepted" && candidate.operation === "screen-record") {
        const result = candidate.result as import("../domain/review-model").ScreeningModelResult;
        this.ctx.storage.sql.exec(
          "INSERT INTO screening_decisions (id, record_id, stage, reviewer, decision, reason, criterion, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(),
          candidate.recordId,
          candidate.stage,
          actor,
          result.decision,
          `${result.rationale}\nEvidence: ${result.evidence}`,
          result.criterion,
          now,
          revision,
        );
      }
      if (disposition === "accepted" && candidate.operation === "extract-field") {
        const result = candidate.result as import("../domain/review-model").ExtractionModelResult;
        this.assertEvidenceRecord(candidate.recordId, actor);
        this.ctx.storage.sql.exec(
          "INSERT INTO extracted_data_values (id, record_id, field_id, value_json, missing_reason, evidence_json, reviewer, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(),
          candidate.recordId,
          result.fieldId,
          JSON.stringify(result.value),
          result.missingReason,
          result.evidence ? JSON.stringify(result.evidence) : null,
          actor,
          now,
          revision,
        );
      }
    });
    return this.getModelSnapshot(actor);
  }

  getSynthesis(actor: string): ReviewSynthesis {
    const current = this.getSnapshot();
    return this.getSynthesisAtRevision(current.revision, actor);
  }

  getSynthesisAtRevision(revision: number, actor: string): ReviewSynthesis {
    this.assertReconstructibleRevision(revision);
    return buildReviewSynthesis(
      this.studySnapshotAtRevision(revision),
      this.searchSnapshotAtRevision(revision),
      this.screeningSnapshotAtRevision(revision, actor),
      this.evidenceSnapshotAtRevision(revision, actor),
    );
  }

  getExportAuthority(actor: string): ReviewExportAuthority {
    const current = this.getSnapshot();
    return this.getExportAuthorityAtRevision(current.revision, actor);
  }

  getExportAuthorityAtRevision(revision: number, actor: string): ReviewExportAuthority {
    this.assertReconstructibleRevision(revision);
    const protocol = this.studySnapshotAtRevision(revision);
    const search = this.searchSnapshotAtRevision(revision);
    const screening = this.screeningSnapshotAtRevision(revision, actor);
    const evidence = this.evidenceSnapshotAtRevision(revision, actor);
    const model = this.modelSnapshotAtRevision(revision, null);
    const synthesis = buildReviewSynthesis(protocol, search, screening, evidence);
    return { revision, protocol, search, screening, evidence, model, synthesis };
  }

  async getBackupSnapshot(actor: string): Promise<{
    authority: ReviewExportAuthority | null;
    revisionSeed: string | null;
    bookmark: string | null;
  }> {
    if (this.protocolRows().length === 0) return { authority: null, revisionSeed: null, bookmark: null };
    const authority = this.getExportAuthority(actor);
    return {
      authority,
      revisionSeed: `review:${authority.revision}:protocol:${authority.protocol.protocol.revision}`,
      bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE),
    };
  }

  async deleteReviewData(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private appendProtocol(content: ReviewProtocolContent, status: "draft" | "frozen", rationale: string, actor: string): void {
    this.ctx.storage.transactionSync(() => {
      const revision = this.advanceRevision();
      const protocol = materializeProtocolRevision(content, revision, status, rationale, actor);
      this.ctx.storage.sql.exec(
        "INSERT INTO protocol_revisions (revision, status, payload_json, rationale, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        protocol.revision,
        protocol.status,
        JSON.stringify(protocolContent(protocol)),
        protocol.rationale,
        protocol.createdAt,
        protocol.createdBy,
      );
    });
  }

  private currentRevision(): number {
    return this.revisionMeta().revision;
  }

  private revisionMeta(): MetaRow {
    return this.ctx.storage.sql.exec<MetaRow>("SELECT * FROM review_meta WHERE singleton = 1").one();
  }

  private studySnapshotAtRevision(revision: number): ReviewStudySnapshot {
    const history = this.protocolRows()
      .filter((row) => row.revision <= revision)
      .map(protocolFromRow);
    const protocol = history.at(-1);
    if (!protocol) throw new Error(`Review revision ${revision} has no protocol state`);
    return { revision, protocol, protocolHistory: history };
  }

  private protocolRows(): ProtocolRow[] {
    return this.ctx.storage.sql.exec<ProtocolRow>("SELECT * FROM protocol_revisions ORDER BY revision ASC").toArray();
  }

  private assertRevision(expected: number, actual: number): void {
    if (!Number.isSafeInteger(expected) || expected !== actual)
      throw new Error(`Review revision conflict: expected ${expected}, current ${actual}`);
  }

  private assertReconstructibleRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Review revision is invalid");
    const meta = this.revisionMeta();
    if (revision < meta.history_floor_revision) {
      throw new Error(`Review revision ${revision} predates reconstructible history floor ${meta.history_floor_revision}`);
    }
    if (revision > meta.revision) throw new Error(`Review revision ${revision} is unavailable; current ${meta.revision}`);
    if (revision === 0 || !this.protocolRows().some((row) => row.revision <= revision)) {
      throw new Error(`Review revision ${revision} has no protocol state`);
    }
  }

  private advanceRevision(): number {
    const revision = this.currentRevision() + 1;
    this.ctx.storage.sql.exec("UPDATE review_meta SET revision = ? WHERE singleton = 1", revision);
    return revision;
  }

  private insertDuplicateCandidate(match: ReviewDuplicateMatch, revision: number): void {
    const [leftId, rightId] = [match.leftId, match.rightId].sort();
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO duplicate_candidates (id, left_id, right_id, signals_json, confidence, status, resolved_at, resolved_by, created_revision, resolved_revision) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL)",
      crypto.randomUUID(),
      leftId,
      rightId,
      JSON.stringify(match.signals),
      match.confidence,
      revision,
    );
  }

  private assertImportCapacity(importedRecords: number): void {
    const meta = this.revisionMeta();
    if (meta.search_run_count >= reviewAggregateLimits.searchRuns) throw new Error("Review search run limit reached");
    if (meta.import_batch_count >= reviewAggregateLimits.importBatches) throw new Error("Review import batch limit reached");
    if (meta.occurrence_count + importedRecords > reviewAggregateLimits.occurrences) {
      throw new Error("Review occurrence limit exceeded");
    }
    if (meta.record_count + importedRecords > reviewAggregateLimits.records) throw new Error("Review record limit exceeded");
  }

  private duplicateMatchesForRevision(revision: number): ReviewDuplicateMatch[] {
    const rows = this.ctx.storage.sql
      .exec<DuplicateKeyMatchRow>(
        `SELECT
          candidate.record_id,
          (
            SELECT MIN(existing.record_id)
            FROM review_record_duplicate_keys existing
            JOIN review_records record ON record.id = existing.record_id AND record.state = 'active'
            WHERE candidate.doi_key <> ''
              AND existing.doi_key = candidate.doi_key
              AND (existing.created_revision < candidate.created_revision
                OR (existing.created_revision = candidate.created_revision AND existing.record_id < candidate.record_id))
          ) AS doi_match_id,
          (
            SELECT MIN(existing.record_id)
            FROM review_record_duplicate_keys existing
            JOIN review_records record ON record.id = existing.record_id AND record.state = 'active'
            WHERE candidate.title_author_year_key <> ''
              AND existing.title_author_year_key = candidate.title_author_year_key
              AND (existing.created_revision < candidate.created_revision
                OR (existing.created_revision = candidate.created_revision AND existing.record_id < candidate.record_id))
          ) AS title_author_year_match_id,
          (
            SELECT MIN(existing.record_id)
            FROM review_record_duplicate_keys existing
            JOIN review_records record ON record.id = existing.record_id AND record.state = 'active'
            WHERE candidate.title_year_key <> ''
              AND existing.title_year_key = candidate.title_year_key
              AND (existing.created_revision < candidate.created_revision
                OR (existing.created_revision = candidate.created_revision AND existing.record_id < candidate.record_id))
          ) AS title_year_match_id
        FROM review_record_duplicate_keys candidate
        JOIN review_records record ON record.id = candidate.record_id AND record.state = 'active'
        WHERE candidate.created_revision = ?
        ORDER BY candidate.record_id ASC`,
        revision,
      )
      .toArray();
    const matches = new Map<string, { leftId: string; rightId: string; signals: Set<ReviewDuplicateMatch["signals"][number]> }>();
    for (const row of rows) {
      addDuplicateKeyMatch(matches, row.record_id, row.doi_match_id, "doi");
      addDuplicateKeyMatch(matches, row.record_id, row.title_author_year_match_id, "title-author-year");
      if (row.title_year_match_id !== row.title_author_year_match_id) {
        addDuplicateKeyMatch(matches, row.record_id, row.title_year_match_id, "title-year");
      }
    }
    return [...matches.values()]
      .map(({ leftId, rightId, signals }) => {
        const values = [...signals];
        return {
          leftId,
          rightId,
          signals: values,
          confidence: values.includes("doi") || values.includes("title-author-year") ? "exact" : "probable",
        } satisfies ReviewDuplicateMatch;
      })
      .sort((left, right) => left.leftId.localeCompare(right.leftId) || left.rightId.localeCompare(right.rightId));
  }

  private assertEvidenceRecord(recordId: string, actor: string): void {
    const included = this.getScreeningSnapshot(actor).records.some(
      (record) => record.record.id === recordId && record.fullText.outcome === "include",
    );
    if (!included) throw new Error("Appraisal and extraction require full-text inclusion");
  }

  private assertEvidenceRevisionLimit(table: string, fieldColumn: string, recordId: string, fieldId: string, actor: string): void {
    const allowed = new Set(["quality_assessment_values:question_id", "extracted_data_values:field_id"]);
    if (!allowed.has(`${table}:${fieldColumn}`)) throw new Error("Evidence revision query is invalid");
    const count = this.ctx.storage.sql
      .exec<{
        count: number;
      }>(`SELECT COUNT(*) AS count FROM ${table} WHERE record_id = ? AND ${fieldColumn} = ? AND reviewer = ?`, recordId, fieldId, actor)
      .one().count;
    if (count >= 20) throw new Error("Evidence value revision limit reached");
  }
}

function protocolFromRow(row: ProtocolRow): ReviewProtocolRevision {
  const content: unknown = JSON.parse(row.payload_json);
  return materializeProtocolRevision(
    parseReviewProtocolContent(content),
    row.revision,
    row.status,
    row.rationale,
    row.created_by,
    row.created_at,
  );
}

function protocolContent(protocol: ReviewProtocolRevision): ReviewProtocolContent {
  return {
    profile: protocol.profile,
    objective: protocol.objective,
    picoc: protocol.picoc,
    researchQuestions: protocol.researchQuestions,
    conceptGroups: protocol.conceptGroups,
    sources: protocol.sources,
    knownRelevantStudies: protocol.knownRelevantStudies,
    inclusionCriteria: protocol.inclusionCriteria,
    exclusionCriteria: protocol.exclusionCriteria,
    screening: protocol.screening,
    modelAssistance: protocol.modelAssistance,
    qualityAssessment: protocol.qualityAssessment,
    extractionFields: protocol.extractionFields,
  };
}

function runFromRow(row: SearchRunRow, importBatchIds: readonly string[]): ReviewSearchRun {
  return {
    id: row.id,
    protocolRevision: row.protocol_revision,
    sourceId: row.source_id,
    sourceName: row.source_name,
    query: row.query,
    searchedAt: row.searched_at,
    importedAt: row.imported_at,
    importedBy: row.imported_by,
    digest: row.digest,
    reportedResultCount: row.reported_result_count,
    detectedEntries: row.detected_entries,
    skippedEntries: row.skipped_entries,
    occurrenceCount: row.occurrence_count,
    importBatchIds,
  };
}

function importBatchFromRow(row: ImportBatchRow): ReviewImportBatch {
  return {
    id: row.id,
    runId: row.run_id,
    format: row.format,
    filename: row.filename,
    mediaType: row.media_type,
    byteCount: row.byte_count,
    digest: row.digest,
    parserVersion: row.parser_version,
    reportedResultCount: row.reported_result_count,
  };
}

function occurrenceFromRow(row: OccurrenceRow): ReviewImportedOccurrence {
  return {
    id: row.id,
    runId: row.run_id,
    batchId: row.batch_id,
    recordId: row.record_id,
    citationKey: row.citation_key,
    imported: importRecord(row.imported_json),
  };
}

function recordFromRow(row: ReviewRecordRow): ReviewRecord {
  return { id: row.id, state: row.state, mergedInto: row.merged_into, metadata: importRecord(row.metadata_json) };
}

function recordFromRowAtRevision(row: ReviewRecordRow, revision: number): ReviewRecord {
  const merged = row.merged_revision !== null && row.merged_revision <= revision;
  return {
    id: row.id,
    state: merged ? "merged" : "active",
    mergedInto: merged ? row.merged_into : null,
    metadata: importRecord(row.metadata_json),
  };
}

function canonicalRecordIdAtRevision(recordId: string, records: ReadonlyMap<string, ReviewRecord>): string {
  const visited = new Set<string>();
  let current = recordId;
  while (!visited.has(current)) {
    visited.add(current);
    const record = records.get(current);
    if (!record || record.state !== "merged" || !record.mergedInto) return current;
    current = record.mergedInto;
  }
  throw new Error("Stored review record merge cycle is invalid");
}

function candidateFromRow(row: DuplicateCandidateRow): ReviewDuplicateCandidate {
  const signals: unknown = JSON.parse(row.signals_json);
  if (
    !Array.isArray(signals) ||
    !signals.every((signal) => signal === "doi" || signal === "title-author-year" || signal === "title-year")
  ) {
    throw new Error("Stored duplicate signals are invalid");
  }
  return {
    id: row.id,
    leftId: row.left_id,
    rightId: row.right_id,
    signals,
    confidence: row.confidence,
    status: row.status,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

function candidateFromRowAtRevision(row: DuplicateCandidateRow, revision: number): ReviewDuplicateCandidate {
  const resolved = row.resolved_revision !== null && row.resolved_revision <= revision;
  return candidateFromRow({
    ...row,
    status: resolved ? row.status : "pending",
    resolved_at: resolved ? row.resolved_at : null,
    resolved_by: resolved ? row.resolved_by : null,
  });
}

function compareDuplicateCandidates(left: ReviewDuplicateCandidate, right: ReviewDuplicateCandidate): number {
  return right.status.localeCompare(left.status) || left.confidence.localeCompare(right.confidence) || left.id.localeCompare(right.id);
}

function modelCandidateRowAtRevision(row: ModelCandidateRow, revision: number): ModelCandidateRow {
  const disposed = row.disposed_revision !== null && row.disposed_revision <= revision;
  return {
    ...row,
    disposition: disposed ? row.disposition : "pending",
    disposed_at: disposed ? row.disposed_at : null,
    disposed_by: disposed ? row.disposed_by : null,
  };
}

function modelCandidateFromRow(row: ModelCandidateRow, protocol: ReviewProtocolRevision): ReviewModelCandidate {
  const sourceScope: unknown = JSON.parse(row.source_scope_json);
  if (!Array.isArray(sourceScope) || !sourceScope.every((value) => typeof value === "string")) {
    throw new Error("Stored model source scope is invalid");
  }
  const resultValue: unknown = JSON.parse(row.result_json);
  const result = row.operation === "screen-record" ? parseScreeningModelResult(resultValue) : storedExtractionResult(resultValue, protocol);
  return {
    id: row.id,
    operation: row.operation,
    recordId: row.record_id,
    stage: row.stage,
    provider: row.provider,
    model: row.model,
    promptTemplateVersion: row.prompt_template_version,
    sourceScope,
    result,
    createdAt: row.created_at,
    createdBy: row.created_by,
    disposition: row.disposition,
    disposedAt: row.disposed_at,
    disposedBy: row.disposed_by,
  };
}

function storedExtractionResult(value: unknown, protocol: ReviewProtocolRevision): ExtractionModelResult {
  if (!isRecordValue(value) || typeof value.fieldId !== "string") throw new Error("Stored extraction model candidate is invalid");
  const field = protocol.extractionFields.find((candidate) => candidate.id === value.fieldId);
  if (field) return parseExtractionModelResult(value, field);
  if (
    (value.value !== null && typeof value.value !== "string" && typeof value.value !== "number" && typeof value.value !== "boolean") ||
    (value.missingReason !== null && typeof value.missingReason !== "string") ||
    typeof value.rationale !== "string"
  ) {
    throw new Error("Stored extraction model candidate is invalid");
  }
  return {
    fieldId: value.fieldId,
    value: value.value,
    missingReason: value.missingReason,
    evidence: value.evidence === null ? null : parseEvidencePointer(value.evidence, false),
    rationale: value.rationale,
  };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function importRecord(value: string): ReviewImportRecord {
  const parsed: unknown = JSON.parse(value);
  if (!isReviewImportRecord(parsed)) throw new Error("Stored review import record is invalid");
  return parsed;
}

function isReviewImportRecord(value: unknown): value is ReviewImportRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "citationKey" in value &&
    typeof value.citationKey === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "authors" in value &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    "year" in value &&
    typeof value.year === "string" &&
    "doi" in value &&
    typeof value.doi === "string" &&
    "warnings" in value &&
    Array.isArray(value.warnings)
  );
}

function reviewImportProvenance(input: ConfirmReviewSearchRunInput): {
  filename: string;
  mediaType: typeof reviewBibTeXImport.mediaType;
  reportedResultCount: number;
} {
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  if (
    !filename ||
    filename.length > reviewImportLimits.filenameCharacters ||
    !/\.bib$/iu.test(filename) ||
    filename.includes("/") ||
    filename.includes("\\") ||
    hasAsciiControlCharacter(filename)
  ) {
    throw new Error("Review import filename is invalid");
  }
  if (input.mediaType !== reviewBibTeXImport.mediaType) throw new Error("Review import media type is invalid");
  if (
    !Number.isSafeInteger(input.reportedResultCount) ||
    input.reportedResultCount < 0 ||
    input.reportedResultCount > reviewImportLimits.reportedResults
  ) {
    throw new Error("Review reported result count is invalid");
  }
  return { filename, mediaType: input.mediaType, reportedResultCount: input.reportedResultCount };
}

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function addDuplicateKeyMatch(
  matches: Map<string, { leftId: string; rightId: string; signals: Set<ReviewDuplicateMatch["signals"][number]> }>,
  candidateId: string,
  matchId: string | null,
  signal: ReviewDuplicateMatch["signals"][number],
): void {
  if (!matchId || matchId === candidateId) return;
  const [leftId, rightId] = candidateId < matchId ? [candidateId, matchId] : [matchId, candidateId];
  const key = `${leftId}\u0000${rightId}`;
  const match = matches.get(key) ?? { leftId, rightId, signals: new Set<ReviewDuplicateMatch["signals"][number]>() };
  match.signals.add(signal);
  matches.set(key, match);
}

function validTimestamp(value: string, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid`);
  return new Date(value).toISOString();
}

function decisionFromRow(row: ScreeningDecisionRow): ScreeningDecision {
  return {
    id: row.id,
    recordId: row.record_id,
    stage: row.stage,
    reviewer: row.reviewer,
    decision: row.decision,
    reason: row.reason,
    criterion: row.criterion,
    createdAt: row.created_at,
  };
}

function adjudicationFromRow(row: ScreeningAdjudicationRow): ScreeningAdjudication {
  return {
    id: row.id,
    recordId: row.record_id,
    stage: row.stage,
    outcome: row.outcome,
    reason: row.reason,
    adjudicator: row.adjudicator,
    createdAt: row.created_at,
  };
}

function screeningRecord(
  record: ReviewRecord,
  decisions: readonly ScreeningDecision[],
  adjudications: readonly ScreeningAdjudication[],
  reviewersPerStage: 1 | 2,
  blinded: boolean,
  actor: string,
): ScreeningRecordState {
  const stateFor = (stage: ScreeningStage) => {
    const stageDecisions = decisions.filter((decision) => decision.recordId === record.id && decision.stage === stage);
    const reviewers = new Set(stageDecisions.map((decision) => decision.reviewer.toLocaleLowerCase()));
    const visibleDecisions =
      blinded && reviewers.size < reviewersPerStage ? stageDecisions.filter((decision) => decision.reviewer === actor) : stageDecisions;
    const adjudication = adjudications.filter((item) => item.recordId === record.id && item.stage === stage).at(-1) ?? null;
    const derived = screeningStageState(stageDecisions, adjudication, reviewersPerStage);
    return { ...derived, decisions: visibleDecisions };
  };
  return { record, titleAbstract: stateFor("title-abstract"), fullText: stateFor("full-text") };
}

function screeningCounts(records: readonly ScreeningRecordState[]): ReviewScreeningSnapshot["counts"] {
  return {
    titleAbstractPending: records.filter((record) => record.titleAbstract.outcome === "pending").length,
    titleAbstractIncluded: records.filter((record) => record.titleAbstract.outcome === "include").length,
    fullTextPending: records.filter((record) => record.titleAbstract.outcome === "include" && record.fullText.outcome === "pending").length,
    fullTextIncluded: records.filter((record) => record.fullText.outcome === "include").length,
    conflicts: records.filter((record) => record.titleAbstract.outcome === "conflict" || record.fullText.outcome === "conflict").length,
  };
}

function boundedScreeningText(value: string, label: string, maximum: number, allowEmpty: boolean): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximum) throw new Error(`${label} is invalid`);
  return normalized;
}

function qualityValueFromRow(row: QualityValueRow): QualityAssessmentValue {
  return {
    id: row.id,
    recordId: row.record_id,
    questionId: row.question_id,
    answerId: row.answer_id,
    evidence: parseEvidencePointer(JSON.parse(row.evidence_json), false),
    rationale: row.rationale,
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}

function extractionValueFromRow(row: ExtractionValueRow): ExtractedDataValue {
  const value: unknown = JSON.parse(row.value_json);
  if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new Error("Stored extraction value is invalid");
  }
  return {
    id: row.id,
    recordId: row.record_id,
    fieldId: row.field_id,
    value,
    missingReason: row.missing_reason,
    evidence: row.evidence_json ? parseEvidencePointer(JSON.parse(row.evidence_json), true) : null,
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}
